/**
 * Central export of all Wake MCP tools.
 *
 * Read-only Storefront GraphQL operations (catalog) + Admin REST operations
 * (orders / analytics).
 */
import { productTools } from "./products.ts";
import { catalogTools } from "./catalog.ts";
import { storeTools } from "./store.ts";
import { orderTools } from "./orders.ts";

export const tools = [
  ...productTools,
  ...catalogTools,
  ...storeTools,
  ...orderTools,
];
