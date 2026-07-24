/**
 * Shopify MCP
 *
 * Read-only MCP for the Shopify Admin GraphQL API — products, collections,
 * orders, customers, inventory, fulfillment, discounts, online store content,
 * B2B, markets, Shopify Payments and ShopifyQL analytics.
 */
import { serve } from "@decocms/mcps-shared/serve";
import { withRuntime } from "@decocms/runtime";
import { tools } from "./tools/index.ts";
import { type Env, StateSchema } from "./types/env.ts";
import packageJson from "../package.json" with { type: "json" };

console.log(`Shopify MCP v${packageJson.version}`);

export type { Env };
export { StateSchema };

const runtime = withRuntime<Env, typeof StateSchema>({
  configuration: {
    state: StateSchema,
  },
  tools,
});

serve(runtime.fetch);
