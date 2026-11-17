import { withRuntime } from "@decocms/runtime";
import { serve } from "@decocms/mcps-shared/serve";
import { withRequestHeaders } from "./lib/request-config.ts";
import { tools } from "./tools/index.ts";
import { type Env, StateSchema } from "./types/env.ts";

export type { Env };
export { StateSchema };

const runtime = withRuntime<Env, typeof StateSchema>({
  configuration: { state: StateSchema },
  tools,
});

/**
 * Served without `withAuth`: the Authorization header carries the user's DY API key
 * and x-dy-* headers the console login (see request-config.ts). Tracked in `auth-exemptions.json`.
 */
const runtimeFetch = runtime.fetch;
if (runtimeFetch) {
  serve((req, env, ctx) =>
    withRequestHeaders(req.headers, () => runtimeFetch(req, env, ctx)),
  );
}
