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
import { handleOAuthRoute, shopifyOAuth } from "./lib/oauth.ts";
import packageJson from "../package.json" with { type: "json" };

console.log(`Shopify MCP v${packageJson.version}`);

export type { Env };
export { StateSchema };

const runtime = withRuntime<Env, typeof StateSchema>({
  oauth: shopifyOAuth,
  configuration: {
    state: StateSchema,
  },
  tools,
});

// Intercept the two custom OAuth routes (store-domain prompt + Shopify
// callback); everything else falls through to the runtime.
serve(async (req, env, ctx) => {
  const oauthResponse = await handleOAuthRoute(req);
  if (oauthResponse) return oauthResponse;
  return runtime.fetch(req, env, ctx);
});
