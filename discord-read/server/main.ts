/**
 * Discord MCP Server - Main Entry Point
 *
 * MCP server for Discord bot integration with message indexing
 * and AI agent commands. Supports multi-tenant: multiple connections
 * can each run their own Discord bot on the same pod.
 */

import { serve } from "@decocms/mcps-shared/serve";
import { withRuntime } from "@decocms/runtime";
import { setDatabaseEnv } from "../shared/db.ts";
import {
  updateEnv,
  ensureBotRunning,
  shutdownAllBots,
  isBotRunning,
} from "./bot-manager.ts";
import { getOrCreateInstance, getInstance } from "./bot-instance.ts";
import { tools } from "./tools/index.ts";
import { type Env, type Registry, StateSchema } from "./types/env.ts";
import { logger, HyperDXLogger } from "./lib/logger.ts";
import { app as webhookRouter } from "./router.ts";
import {
  setDiscordConfig,
  getDiscordConfig,
  type DiscordConfig,
} from "./lib/config-cache.ts";

export { StateSchema };

// ============================================================================
// STARTUP DEBUGGING
// ============================================================================
const INSTANCE_ID = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

console.log("=".repeat(80));
console.log("[STARTUP] Discord MCP Server initializing...");
console.log(`[STARTUP] Instance ID: ${INSTANCE_ID}`);
console.log(`[STARTUP] K8s pod: ${process.env.HOSTNAME || "n/a"}`);
console.log(`[STARTUP] Node.js version: ${process.version}`);
console.log(`[STARTUP] Bun version: ${Bun.version}`);
console.log(`[STARTUP] NODE_ENV: ${process.env.NODE_ENV || "not set"}`);
console.log(`[STARTUP] PORT: ${process.env.PORT || "not set"}`);
console.log(`[STARTUP] Working directory: ${process.cwd()}`);
console.log("=".repeat(80));

// Auto-restart cron interval (1 hour)
const AUTO_RESTART_INTERVAL_MS = 60 * 60 * 1000;
let autoRestartInterval: ReturnType<typeof setInterval> | null = null;

/**
 * Extract a JSON-serializable snapshot of the current Mesh state.
 *
 * Why: bootstrap (post-deploy / fresh pod) needs to rebuild
 * MESH_REQUEST_CONTEXT.state from Supabase before Mesh fires onChange. The
 * trick is the SOURCE: when `onChange(env, config)` is called, `env.state`
 * has resolved Proxies (which serialize to `{}`), but `config.state` has the
 * raw `{__type, value, ...}` metadata for bindings. By preferring
 * `config.state` upstream, we get serializable metadata for AGENT/CONNECTION
 * bindings — including `state.AGENT.value` which is the agent_id we need
 * for the direct-HTTP fallback in `llm.ts` when the binding proxy isn't
 * available yet.
 *
 * Function-typed values (anything that survived as a Proxy) are dropped via
 * the JSON.stringify check.
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
      const traceId = HyperDXLogger.generateTraceId();
      const connectionId = env.MESH_REQUEST_CONTEXT?.connectionId;

      logger.info("Configuration changed", {
        trace_id: traceId,
        organizationId: env.MESH_REQUEST_CONTEXT?.organizationId,
        connectionId,
      });

      // Update env for this specific connection
      updateEnv(env);

      // Set database env for shared module
      setDatabaseEnv(env);

      // Prefer the raw config.state (has binding metadata like {__type, value})
      // over env.state (which has resolved Proxies that serialize to {} and
      // hide the agent_id). Fall back to env.state when config isn't passed.
      const rawState = config?.state ?? env.MESH_REQUEST_CONTEXT?.state;
      const state = env.MESH_REQUEST_CONTEXT?.state;
      const meshUrl = env.MESH_REQUEST_CONTEXT?.meshUrl;
      const organizationId = env.MESH_REQUEST_CONTEXT?.organizationId;
      const token = env.MESH_REQUEST_CONTEXT?.token;

      // Configure HyperDX logger if API key is provided
      if (state?.HYPERDX_API_KEY) {
        logger.setApiKey(state.HYPERDX_API_KEY);
        logger.info("HyperDX logger configured", {
          trace_id: traceId,
          organizationId,
        });
      }

      // Database tables are managed via Supabase
      console.log("[Setup] Skipping database initialization (using Supabase)");

      logger.info("Database tables ready", {
        trace_id: traceId,
        organizationId,
      });

      console.log("[CONFIG] Agent binding configured via AgentOf()");

      // ======================================================================
      // Sync StateSchema fields to config-cache for webhook endpoint
      // ======================================================================
      const authorization = env.MESH_REQUEST_CONTEXT?.authorization;
      const discordPublicKey = state?.DISCORD_PUBLIC_KEY;
      const discordApplicationId = state?.DISCORD_APPLICATION_ID;
      const authorizedGuildsStr = state?.AUTHORIZED_GUILDS;
      const botOwnerId = state?.BOT_OWNER_ID;
      const commandPrefix = state?.COMMAND_PREFIX || "!";
      const superAdminsStr = state?.BOT_SUPER_ADMINS;

      // Parse authorized guilds (comma-separated string to array)
      const authorizedGuilds = authorizedGuildsStr
        ? authorizedGuildsStr
            .split(",")
            .map((g) => g.trim())
            .filter(Boolean)
        : [];

      // Parse and set super admins per connection
      const superAdmins = superAdminsStr
        ? superAdminsStr
            .split(",")
            .map((id) => id.trim())
            .filter(Boolean)
        : [];
      if (connectionId && superAdmins.length > 0) {
        // Ensure the instance exists before setting super admins
        const instance = getOrCreateInstance(connectionId, env);
        instance.superAdmins = superAdmins;
        console.log(
          `[CONFIG] Super admins for ${connectionId}: ${superAdmins.length} configured`,
        );
      }

      // Stash the Mesh agent id on the instance from the RAW config.state
      // (which still has `AGENT: {__type, value, ...}` metadata). After this
      // onChange returns, env.state.AGENT is replaced by a resolved Proxy
      // that no longer exposes `.value`, so we'd lose the id otherwise.
      if (connectionId) {
        const rawAgent = (rawState as Record<string, unknown> | undefined)
          ?.AGENT as { id?: string; value?: string } | undefined;
        const agentIdFromRaw = rawAgent?.value ?? rawAgent?.id;
        if (agentIdFromRaw) {
          const instance = getOrCreateInstance(connectionId, env);
          instance.agentId = agentIdFromRaw;
          console.log(
            `[CONFIG] Stashed agent_id for ${connectionId}: ${agentIdFromRaw}`,
          );
        }
      }

      // Sync to config-cache — merge with existing config for missing fields
      const existingConfig = connectionId
        ? await getDiscordConfig(connectionId)
        : null;

      const mergedConnectionId = connectionId || existingConfig?.connectionId;
      const mergedOrgId = organizationId || existingConfig?.organizationId;
      const mergedMeshUrl = meshUrl || existingConfig?.meshUrl;

      console.log(
        `[CONFIG] Save check: connectionId=${mergedConnectionId || "MISSING"}, organizationId=${mergedOrgId || "MISSING"}, meshUrl=${mergedMeshUrl ? "yes" : "MISSING"}, authorization=${authorization ? "yes" : "MISSING"}`,
      );

      if (mergedConnectionId && mergedOrgId && mergedMeshUrl) {
        let botToken = existingConfig?.botToken || "";
        if (authorization) {
          const authMatch = authorization.match(/^Bearer\s+(.+)$/i);
          if (authMatch) {
            botToken = authMatch[1];
          }
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
          ownerId: botOwnerId || existingConfig?.ownerId,
          commandPrefix,
          state: persistableState,
          updatedAt: new Date().toISOString(),
        };

        await setDiscordConfig(configToSave);
        console.log(
          `[CONFIG] Synced config for connection ${mergedConnectionId}`,
        );
        console.log(
          `[CONFIG] Bot token: ${botToken ? `${botToken.slice(0, 10)}...${botToken.slice(-4)}` : "MISSING"}`,
        );
      } else {
        console.warn(
          `[CONFIG] Cannot save config — missing after merge: ${!mergedConnectionId ? "connectionId " : ""}${!mergedOrgId ? "organizationId " : ""}${!mergedMeshUrl ? "meshUrl" : ""}`,
        );
      }

      // Auto-initialize Discord client for this connection
      const hasAuth = !!env.MESH_REQUEST_CONTEXT?.authorization;
      if (hasAuth) {
        if (isBotRunning(env)) {
          console.log(
            `[CONFIG] Bot already running for ${connectionId || "unknown"}`,
          );
        } else {
          console.log(
            `[CONFIG] Auto-starting Discord bot for ${connectionId || "unknown"}...`,
          );
          try {
            const started = await ensureBotRunning(env);
            if (started) {
              console.log(
                `[CONFIG] Bot auto-started for ${connectionId || "unknown"}`,
              );
            } else {
              console.log(
                `[CONFIG] Bot auto-start failed for ${connectionId || "unknown"}. Will retry on next auto-restart cycle.`,
              );
            }
          } catch (error) {
            console.error(
              `[CONFIG] Bot auto-start error for ${connectionId || "unknown"}:`,
              error instanceof Error ? error.message : String(error),
            );
          }
        }
      } else {
        logger.info(
          "Discord Bot Token not configured - waiting for authorization",
          {
            trace_id: traceId,
            organizationId,
          },
        );
      }
    },
    scopes: ["CONNECTION::*", "*"],
    state: StateSchema,
  },
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  tools: tools as any,
  prompts: [],
});

// Graceful shutdown handler - destroy ALL Discord clients
async function gracefulShutdown(signal: string) {
  console.log(`\n[SHUTDOWN] Received ${signal}, shutting down...`);

  try {
    if (autoRestartInterval) {
      console.log("[SHUTDOWN] Stopping auto-restart cron...");
      clearInterval(autoRestartInterval);
      autoRestartInterval = null;
    }

    console.log("[SHUTDOWN] Destroying all Discord clients...");
    await shutdownAllBots();
    console.log("[SHUTDOWN] All Discord clients destroyed");
  } catch (error) {
    console.error("[SHUTDOWN] Error during shutdown:", error);
  }

  process.exit(0);
}

// Register shutdown handlers
process.on("SIGINT", () => gracefulShutdown("SIGINT"));
process.on("SIGTERM", () => gracefulShutdown("SIGTERM"));
process.on("beforeExit", () => gracefulShutdown("beforeExit"));

process.on("uncaughtException", async (error) => {
  console.error("[CRASH] Uncaught exception:", error);
  await gracefulShutdown("uncaughtException");
});

// ============================================================================
// START HTTP SERVER
// ============================================================================
console.log("[SERVER] Starting HTTP server...");
console.log(
  `[SERVER] PORT env variable: ${process.env.PORT || "not set (will use default)"}`,
);

try {
  serve(async (req, env, ctx) => {
    const webhookResponse = await webhookRouter.fetch(req, env, ctx);
    if (webhookResponse.status === 404) {
      return runtime.fetch(req, env, ctx);
    }
    return webhookResponse;
  });
  console.log("[SERVER] serve() called successfully");
  console.log("[SERVER] Webhook endpoint: /discord/interactions/:connectionId");
  console.log("[SERVER] Health check: /health");
} catch (error) {
  console.error("[SERVER] Failed to start server:", error);
  throw error;
}

console.log(`
Discord MCP Server Started
  Status:      HTTP Server Ready
  Discord Bot: Waiting for configuration (multi-tenant)
`);

// ============================================================================
// Auto-Restart Cron Job (every 1 hour)
// ============================================================================

import { getAllInstances } from "./bot-instance.ts";
import {
  loadAllConnectionConfigs,
  loadAllTriggerCredentials,
} from "./lib/supabase-client.ts";

/**
 * Bootstrap bots from Supabase on startup (no onChange needed).
 *
 * Loads all saved connection configs and auto-starts each bot using
 * a synthetic env built from the persisted config. This ensures bots
 * come back online after deploy/restart without waiting for a user
 * to save config in the Mesh UI.
 */
async function bootstrapFromSupabase(): Promise<void> {
  console.log("[BOOTSTRAP] Loading saved connections from Supabase...");

  try {
    const rows = await loadAllConnectionConfigs();

    if (rows.length === 0) {
      console.log("[BOOTSTRAP] No saved connections found");
      return;
    }

    console.log(`[BOOTSTRAP] Found ${rows.length} saved connection(s)`);

    // Deduplicate by bot_token — only start one Discord client per unique token.
    // Multiple connections sharing the same bot share the same Client instance.
    // Maps bot_token → connectionId of the primary (first) instance that started it.
    const tokenToOwner = new Map<string, string>();

    for (const row of rows) {
      const connectionId = row.connection_id;

      if (!row.bot_token) {
        console.log(
          `[BOOTSTRAP] Skipping ${connectionId} — no bot token saved`,
        );
        continue;
      }

      const meshUrl = row.mesh_url;
      const meshApiKey = row.mesh_api_key || row.mesh_token;

      // Sync config to in-memory cache (always, even for duplicate tokens)
      const { setDiscordConfig } = await import("./lib/config-cache.ts");
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
        ownerId: row.owner_id || undefined,
        commandPrefix: row.command_prefix || "!",
      });

      // Build a synthetic env so ensureBotRunning can resolve the token.
      // state is restored from row.state (the StateSchema snapshot persisted
      // on the last onChange). Bindings (AGENT, CONNECTION) stay missing
      // until the real onChange re-injects them — but everything else
      // (CONTEXT_CONFIG, RESPONSE_CONFIG, BOT_SUPER_ADMINS, ALLOW_DM,
      // DEBUG_ERRORS_TO_CHAT, ...) is available immediately.
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

      // Ensure instance is created (superAdmins come from StateSchema on next onChange)
      const instance = getOrCreateInstance(connectionId, syntheticEnv);

      // Stash agent_id from the persisted state.AGENT metadata so the LLM
      // path can call ensureMeshThread + direct HTTP fallback on the very
      // first message — without waiting for Mesh to fire onChange.
      const persistedAgent = (
        row.state as Record<string, unknown> | null | undefined
      )?.AGENT as { id?: string; value?: string } | undefined;
      const persistedAgentId = persistedAgent?.value ?? persistedAgent?.id;
      if (persistedAgentId) {
        instance.agentId = persistedAgentId;
      }

      // If another connection already started a client for this token, share it
      const ownerConnectionId = tokenToOwner.get(row.bot_token);
      if (ownerConnectionId) {
        const ownerInstance = getInstance(ownerConnectionId);
        if (ownerInstance?.client) {
          instance.client = ownerInstance.client;
          instance.initialized = true;
          console.log(
            `[BOOTSTRAP] ${connectionId} sharing client from ${ownerConnectionId} (same token)`,
          );
        }
        continue;
      }

      try {
        console.log(`[BOOTSTRAP] Starting bot for ${connectionId}...`);
        const started = await ensureBotRunning(syntheticEnv);
        if (started) {
          tokenToOwner.set(row.bot_token, connectionId);
          console.log(`[BOOTSTRAP] Bot started for ${connectionId} ✓`);
        } else {
          console.log(`[BOOTSTRAP] Bot failed to start for ${connectionId}`);
        }
      } catch (error) {
        console.error(
          `[BOOTSTRAP] Error starting bot for ${connectionId}:`,
          error instanceof Error ? error.message : String(error),
        );
      }
    }
  } catch (error) {
    console.error(
      "[BOOTSTRAP] Failed to load configs from Supabase:",
      error instanceof Error ? error.message : String(error),
    );
  }
}

/**
 * Check all bot instances and restart any that are down.
 */
async function autoRestartCheck(): Promise<void> {
  const instances = getAllInstances();

  if (instances.length === 0) {
    console.log("[AUTO-RESTART] No bot instances registered");
    return;
  }

  for (const instance of instances) {
    if (!instance.client || !instance.client.isReady()) {
      console.log(
        `[AUTO-RESTART] Bot for ${instance.connectionId} is down, attempting restart...`,
      );

      const hasAuth = !!instance.env.MESH_REQUEST_CONTEXT?.authorization;
      if (!hasAuth) {
        console.log(
          `[AUTO-RESTART] No authorization for ${instance.connectionId}, skipping`,
        );
        continue;
      }

      try {
        await ensureBotRunning(instance.env);
        console.log(
          `[AUTO-RESTART] Bot restarted for ${instance.connectionId}`,
        );
      } catch (error) {
        console.error(
          `[AUTO-RESTART] Failed to restart ${instance.connectionId}:`,
          error instanceof Error ? error.message : String(error),
        );
      }
    } else {
      console.log(
        `[AUTO-RESTART] Bot for ${instance.connectionId} is healthy (${instance.client.guilds.cache.size} guilds)`,
      );
    }
  }
}

setImmediate(async () => {
  // Bootstrap bots from Supabase first (no onChange needed)
  await bootstrapFromSupabase();

  // Pre-warm: log trigger credentials available in Supabase
  try {
    const allCredentials = await loadAllTriggerCredentials();
    for (const { connectionId, state } of allCredentials) {
      console.log(
        `[BOOTSTRAP] Trigger credentials found for ${connectionId}: ${state.activeTriggerTypes.length} type(s)`,
      );
    }
    console.log(
      `[BOOTSTRAP] ${allCredentials.length} trigger credential(s) available in Supabase`,
    );
  } catch (error) {
    console.warn(
      "[BOOTSTRAP] Failed to load trigger credentials:",
      error instanceof Error ? error.message : String(error),
    );
  }

  // Then schedule periodic health checks
  autoRestartInterval = setInterval(autoRestartCheck, AUTO_RESTART_INTERVAL_MS);
  console.log(`[CRON] Auto-restart check scheduled every 1 hour`);
});
