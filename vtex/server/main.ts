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

// DEBUG PROBE — temporary. If `requestCount` increments across requests, the
// isolate is being reused and module-scope caches in @decocms/runtime should
// stick. If it always reads `1`, Workers is spawning a fresh isolate per
// request and the runtime's tools/list cache can never hit. Logs are printed
// before and after the runtime fetch, with timing.
const isolateBootedAt = Date.now();
let requestCount = 0;

export default {
  fetch: async (req: Request, env: Env, ctx: ExecutionContext) => {
    const myReq = ++requestCount;
    const t0 = Date.now();
    console.log(
      `[vtex-probe] req#${myReq} isolateAge=${t0 - isolateBootedAt}ms url=${new URL(req.url).pathname}`,
    );
    try {
      const res = await runtime.fetch(req, env, ctx);
      console.log(
        `[vtex-probe] req#${myReq} done status=${res.status} ms=${Date.now() - t0}`,
      );
      return res;
    } catch (err) {
      console.log(
        `[vtex-probe] req#${myReq} threw after ${Date.now() - t0}ms`,
        err,
      );
      throw err;
    }
  },
};
