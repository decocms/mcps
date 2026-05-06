/**
 * VTEX Commerce MCP — Cloudflare Workers entrypoint
 *
 * MCP for VTEX Commerce APIs - Catalog, Orders, and Logistics/Inventory.
 * Auth is per-connection static config (accountName/appKey/appToken) supplied
 * via the configSchema in app.json — no OAuth.
 */
import { withRuntime } from "@decocms/runtime";
import { tools } from "./tools/index.ts";
import { type Env, StateSchema } from "./types/env.ts";

export type { Env };
export { StateSchema };

const runtime = withRuntime<Env, typeof StateSchema>({
  configuration: {
    state: StateSchema,
  },
  tools,
});

export default {
  fetch: runtime.fetch,
};
