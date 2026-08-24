/**
 * Wake MCP — Main Entry Point
 *
 * V1: read-only access to the Wake Commerce Storefront GraphQL API
 * (products, search, catalog navigation, shipping quotes and shop metadata).
 */
import { withRuntime } from "@decocms/runtime";
import { serve } from "@decocms/mcps-shared/serve";

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
 * Served without `withAuth` for parity with the other deco-hosted commerce MCPs
 * (VTEX, Shopify, Magento…), which are still open pending the shared-secret
 * rollout. Tracked in `auth-exemptions.json`; re-add `withAuth` once the Mesh
 * token-forwarding path is in place so end users don't have to supply a secret.
 */
if (runtime.fetch) {
  serve(runtime.fetch);
}
