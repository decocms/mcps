/**
 * Wake MCP — Main Entry Point
 *
 * V1: read-only access to the Wake Commerce Storefront GraphQL API
 * (products, search, catalog navigation, shipping quotes and shop metadata).
 */
import { withRuntime } from "@decocms/runtime";
import { serve } from "@decocms/mcps-shared/serve";
import { withAuth } from "@decocms/mcps-shared/auth";

import { tools } from "./tools/index.ts";
import { type Env, StateSchema } from "./types/env.ts";
import packageJson from "../package.json" with { type: "json" };

console.log(`Wake MCP v${packageJson.version}`);

export type { Env };
export { StateSchema };

const runtime = withRuntime<Env, typeof StateSchema>({
  configuration: {
    state: StateSchema,
  },
  tools,
});

/**
 * `withAuth` is mandatory: this MCP is served on a public hostname, so every
 * request must present the shared secret from the AUTH_TOKEN environment
 * variable. It is read at startup — without it the process exits instead of
 * serving anonymous traffic. `scripts/check-auth.ts` fails CI if it is removed.
 */
if (runtime.fetch) {
  serve(withAuth(runtime.fetch));
}
