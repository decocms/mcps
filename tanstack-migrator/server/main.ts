/**
 * TanStack Migrator MCP — entrypoint.
 *
 * Orchestrates Fresh/Deno → TanStack Start storefront migrations:
 * FIFO queue → GitHub -tanstack repo → mesh sandbox running Claude
 * (migrate script + parity fix loop) → Cloudflare Workers Builds deploy.
 *
 * Pod-boot lifecycle (discord MCP pattern):
 *   1. withRuntime() provides the MCP fetch handler, served by Bun.
 *   2. The background worker starts immediately and rebuilds all context
 *      from Supabase (sitemig_connections/sitemig_sites) — restart-safe.
 *   3. Mesh onChange is the source of truth for fresh config: it persists
 *      the connection snapshot and auto-mints a durable API key so the
 *      worker can call mesh (bindings, VM tools, decopilot) for hours.
 */

import { serve } from "@decocms/mcps-shared/serve";
import { withRuntime } from "@decocms/runtime";
import packageJson from "../package.json" with { type: "json" };
import { isSupabaseConfigured } from "./db/client.ts";
import { loadConnection, saveConnection } from "./db/connections.ts";
import { startWorker, stopWorker } from "./engine/worker.ts";
import {
  API_KEY_GRANTS_STATE_KEY,
  desiredGrants,
  grantsChanged,
  mintPersistentApiKey,
} from "./lib/api-key.ts";
import {
  bindingConnectionId,
  extractPersistableState,
} from "./lib/persist-state.ts";
import { dashboardResource } from "./resources/index.ts";
import { tools } from "./tools/index.ts";
import { type Env, StateSchema } from "./types/env.ts";

console.log(`TanStack Migrator MCP v${packageJson.version}`);

export { StateSchema };
export type { Env };

const runtime = withRuntime<Env, typeof StateSchema>({
  configuration: {
    state: StateSchema,
    scopes: [
      "GITHUB::*",
      "OBJECT_STORAGE::GET_PRESIGNED_URL",
      "OBJECT_STORAGE::PUT_PRESIGNED_URL",
    ],
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    onChange: async (env, config?: any) => {
      if (!isSupabaseConfigured()) return;
      const mrc = env.MESH_REQUEST_CONTEXT;
      const connectionId = mrc?.connectionId;
      console.log(
        `[onChange] fired (connection=${connectionId ?? "none"}, hasToken=${!!mrc?.token})`,
      );
      if (!connectionId) return;

      const existing = await loadConnection(connectionId).catch(() => null);
      const organizationId = mrc?.organizationId || existing?.organization_id;
      const meshUrl = mrc?.meshUrl || existing?.mesh_url;
      if (!organizationId || !meshUrl) return;

      // Prefer raw config.state (has serializable binding metadata);
      // fall back to env state when config isn't provided.
      const rawState = (config?.state ?? mrc?.state) as
        | Record<string, unknown>
        | undefined;
      const state = extractPersistableState(rawState);

      // carry grant bookkeeping across saves
      const previousGrants = existing?.state?.[API_KEY_GRANTS_STATE_KEY];
      if (previousGrants !== undefined) {
        state[API_KEY_GRANTS_STATE_KEY] = previousGrants;
      }

      // Durable API key: explicit state field wins; otherwise auto-mint
      // (and re-mint when the binding set changes).
      let meshApiKey =
        (typeof state.MESH_API_KEY === "string" && state.MESH_API_KEY) ||
        existing?.mesh_api_key ||
        null;

      const bindings = [
        bindingConnectionId(state, "GITHUB"),
        bindingConnectionId(state, "OBJECT_STORAGE"),
      ].filter((v): v is string => !!v);
      const grants = desiredGrants({
        connectionId,
        bindingConnectionIds: bindings,
      });

      const needsMint =
        !state.MESH_API_KEY &&
        mrc?.token &&
        (!meshApiKey || grantsChanged(previousGrants, grants));
      if (needsMint) {
        const minted = await mintPersistentApiKey({
          meshUrl,
          organizationId,
          connectionId,
          temporaryToken: mrc.token,
          grants,
        });
        if (minted) {
          meshApiKey = minted;
          state[API_KEY_GRANTS_STATE_KEY] = grants;
          console.log(
            `[onChange] minted persistent API key for ${connectionId}`,
          );
        }
      }

      await saveConnection({
        connectionId,
        organizationId,
        meshUrl,
        meshToken: mrc?.token ?? undefined,
        meshApiKey: meshApiKey ?? undefined,
        state,
      });
    },
  },
  tools: (env: Env) => tools.map((createTool) => createTool(env)),
  resources: [dashboardResource],
});

function gracefulShutdown() {
  try {
    stopWorker();
  } catch {
    // best-effort
  }
  process.exit(0);
}

process.on("SIGINT", gracefulShutdown);
process.on("SIGTERM", gracefulShutdown);

serve(runtime.fetch);

startWorker();
