/**
 * Magento Commerce MCP
 *
 * MCP for Magento 2 REST APIs — sales analytics widgets plus curated tools for
 * orders, catalog, customers, inventory and CMS.
 */
import { serve } from "@decocms/mcps-shared/serve";
import { withRuntime } from "@decocms/runtime";
import {
  cancellationRateResource,
  ordersSalesCardResource,
  ordersTimelineResource,
  statusBreakdownResource,
  topProductsResource,
} from "./resources/index.ts";
import { tools } from "./tools/index.ts";
import { type Env, StateSchema } from "./types/env.ts";
import packageJson from "../package.json" with { type: "json" };

console.log(`Magento Commerce MCP v${packageJson.version}`);

export type { Env };
export { StateSchema };

const runtime = withRuntime<Env, typeof StateSchema>({
  configuration: {
    state: StateSchema,
  },
  tools,
  resources: [
    ordersTimelineResource,
    ordersSalesCardResource,
    cancellationRateResource,
    topProductsResource,
    statusBreakdownResource,
  ],
});

serve(runtime.fetch);
