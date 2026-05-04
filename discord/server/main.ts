/**
 * Discord (events) MCP — entrypoint.
 *
 * Multi-tenant: each Mesh connectionId gets its own Discord.js Gateway client,
 * dedupe by bot_token in the same pod (one Client per token, several
 * connections can point at it).
 *
 * Pod-boot lifecycle:
 *   1. Mesh runtime spins up the worker, calls withRuntime() — this returns a
 *      fetch handler (`runtime.fetch`).
 *   2. We wrap it with our Hono router (/health) and start a Bun HTTP server.
 *   3. setImmediate kicks off `bootstrapFromSupabase` which loads every
 *      saved config and starts a bot per unique bot_token.
 *   4. setInterval runs an hourly health check — restarts any dead clients.
 *
 * Mesh `onChange` is the source of truth for fresh configs (header-borne bot
 * token, latest state). It writes to Supabase so future pod restarts can
 * rebuild without waiting for the user to "Save" in the dashboard.
 */

import { serve } from "@decocms/mcps-shared/serve";
import { withRuntime } from "@decocms/runtime";
import {
  updateEnv,
  ensureBotRunning,
  shutdownAllBots,
  isBotRunning,
} from "./bot/manager.ts";
import {
  getAllInstances,
  getOrCreateInstance,
  getInstance,
} from "./bot/instance.ts";
import { tools } from "./tools/index.ts";
import { type Env, type Registry, StateSchema } from "./types/env.ts";
import { app as router } from "./router.ts";
import {
  setDiscordConfig,
  getDiscordConfig,
  type DiscordConfig,
} from "./lib/config-cache.ts";
import { loadAllConnectionConfigs } from "./lib/supabase.ts";
import * as interactionStore from "./triggers/interaction-store.ts";

export { StateSchema };

const AUTO_RESTART_INTERVAL_MS = 60 * 60 * 1000;
let autoRestartInterval: ReturnType<typeof setInterval> | null = null;

/**
 * Pull a JSON-serializable snapshot of MESH_REQUEST_CONTEXT.state. After
 * onChange returns, env.state's binding values turn into Proxies that
 * serialize to `{}` — we want only the raw values, so we filter by
 * JSON.stringify.
 */
function extractPersistableState(
  state: Record<string, unknown> | undefined,
): Record<string, unknown> {
  if (!state) return {};
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(state)) {
    try {
      JSON.stringify(value);
      out[key] = value;
    } catch {
      // skip non-serializable values
    }
  }
  return out;
}

const runtime = withRuntime<Env, typeof StateSchema, Registry>({
  configuration: {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    onChange: async (env, config?: any) => {
      const connectionId = env.MESH_REQUEST_CONTEXT?.connectionId;

      updateEnv(env);

      // Prefer raw config.state (has serializable binding metadata);
      // fall back to env.state when config isn't provided.
      const rawState = config?.state ?? env.MESH_REQUEST_CONTEXT?.state;
      const state = env.MESH_REQUEST_CONTEXT?.state;
      const meshUrl = env.MESH_REQUEST_CONTEXT?.meshUrl;
      const organizationId = env.MESH_REQUEST_CONTEXT?.organizationId;
      const token = env.MESH_REQUEST_CONTEXT?.token;

      if (connectionId) getOrCreateInstance(connectionId, env);

      const authorization = env.MESH_REQUEST_CONTEXT?.authorization;
      const discordPublicKey = state?.DISCORD_PUBLIC_KEY;
      const discordApplicationId = state?.DISCORD_APPLICATION_ID;
      const authorizedGuildsStr = state?.AUTHORIZED_GUILDS;

      const authorizedGuilds = authorizedGuildsStr
        ? authorizedGuildsStr
            .split(",")
            .map((g: string) => g.trim())
            .filter(Boolean)
        : [];

      const existingConfig = connectionId
        ? await getDiscordConfig(connectionId).catch(() => null)
        : null;

      const mergedConnectionId = connectionId || existingConfig?.connectionId;
      const mergedOrgId = organizationId || existingConfig?.organizationId;
      const mergedMeshUrl = meshUrl || existingConfig?.meshUrl;

      if (mergedConnectionId && mergedOrgId && mergedMeshUrl) {
        let botToken = existingConfig?.botToken || "";
        if (authorization) {
          const m = authorization.match(/^Bearer\s+(.+)$/i);
          if (m) botToken = m[1];
          else botToken = authorization;
        }

        const persistableState = extractPersistableState(rawState);

        const configToSave: DiscordConfig = {
          ...(existingConfig || {}),
          connectionId: mergedConnectionId,
          organizationId: mergedOrgId,
          meshUrl: mergedMeshUrl,
          meshToken: token || existingConfig?.meshToken,
          botToken,
          discordPublicKey:
            discordPublicKey || existingConfig?.discordPublicKey,
          discordApplicationId:
            discordApplicationId || existingConfig?.discordApplicationId,
          authorizedGuilds:
            authorizedGuilds.length > 0
              ? authorizedGuilds
              : existingConfig?.authorizedGuilds,
          state: persistableState,
          updatedAt: new Date().toISOString(),
        };

        await setDiscordConfig(configToSave);
      }

      if (env.MESH_REQUEST_CONTEXT?.authorization && !isBotRunning(env)) {
        try {
          await ensureBotRunning(env);
        } catch {
          // bot will retry on next health check
        }
      }
    },
    scopes: ["CONNECTION::*", "*"],
    state: StateSchema,
  },
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  tools: tools as any,
  prompts: [],
});

// ============================================================================
// GRACEFUL SHUTDOWN
// ============================================================================
async function gracefulShutdown(_signal: string) {
  try {
    if (autoRestartInterval) {
      clearInterval(autoRestartInterval);
      autoRestartInterval = null;
    }
    interactionStore.stopSweeper();
    await shutdownAllBots();
  } catch {
    // best-effort
  }
  process.exit(0);
}

process.on("SIGINT", () => gracefulShutdown("SIGINT"));
process.on("SIGTERM", () => gracefulShutdown("SIGTERM"));
process.on("beforeExit", () => gracefulShutdown("beforeExit"));
process.on("uncaughtException", () => gracefulShutdown("uncaughtException"));

// ============================================================================
// HTTP SERVER
// ============================================================================
serve(async (req, env, ctx) => {
  const routerResponse = await router.fetch(req, env, ctx);
  if (routerResponse.status === 404) {
    return runtime.fetch(req, env, ctx);
  }
  return routerResponse;
});

// ============================================================================
// BOOTSTRAP FROM SUPABASE
// ============================================================================
async function bootstrapFromSupabase(): Promise<void> {
  let rows;
  try {
    rows = await loadAllConnectionConfigs();
  } catch {
    return;
  }

  if (rows.length === 0) return;

  // Dedup by bot_token: only one Client per token, others share it.
  const tokenToOwner = new Map<string, string>();

  for (const row of rows) {
    const connectionId = row.connection_id;
    if (!row.bot_token) continue;

    const meshUrl = row.mesh_url;
    const meshApiKey = row.mesh_api_key || row.mesh_token;

    await setDiscordConfig({
      connectionId,
      organizationId: row.organization_id,
      meshUrl,
      meshToken: row.mesh_token || undefined,
      meshApiKey: row.mesh_api_key || undefined,
      botToken: row.bot_token,
      discordPublicKey: row.discord_public_key || undefined,
      discordApplicationId: row.discord_application_id || undefined,
      authorizedGuilds: row.authorized_guilds || undefined,
      state: row.state ?? undefined,
    });

    // Build a synthetic env so ensureBotRunning can resolve the token
    // without waiting for Mesh to fire onChange.
    const syntheticEnv = {
      MESH_REQUEST_CONTEXT: {
        connectionId,
        organizationId: row.organization_id,
        meshUrl,
        token: meshApiKey || undefined,
        authorization: `Bearer ${row.bot_token}`,
        state: row.state ?? {},
      },
    } as unknown as Env;

    const instance = getOrCreateInstance(connectionId, syntheticEnv);

    // Share an existing client if another connection already owns this token.
    const ownerConnectionId = tokenToOwner.get(row.bot_token);
    if (ownerConnectionId) {
      const ownerInstance = getInstance(ownerConnectionId);
      if (ownerInstance?.client) {
        instance.client = ownerInstance.client;
        instance.initialized = true;
      }
      continue;
    }

    try {
      const started = await ensureBotRunning(syntheticEnv);
      if (started) tokenToOwner.set(row.bot_token, connectionId);
    } catch {
      // will retry on next health check
    }
  }
}

async function autoRestartCheck(): Promise<void> {
  const list = getAllInstances();
  for (const instance of list) {
    if (!instance.client || !instance.client.isReady()) {
      const hasAuth = !!instance.env.MESH_REQUEST_CONTEXT?.authorization;
      if (!hasAuth) continue;
      try {
        await ensureBotRunning(instance.env);
      } catch {
        // retry on the next interval
      }
    }
  }
}

setImmediate(async () => {
  await bootstrapFromSupabase();
  autoRestartInterval = setInterval(autoRestartCheck, AUTO_RESTART_INTERVAL_MS);
  interactionStore.startSweeper();
});
