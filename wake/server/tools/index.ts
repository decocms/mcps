/**
 * Central export of all Wake MCP tools.
 *
 * Read-only Storefront GraphQL operations (catalog) + Admin REST operations
 * (orders / analytics, dashboard aggregates, distribution centers and
 * physical stores, product variant images).
 */
import { productTools } from "./products.ts";
import { catalogTools } from "./catalog.ts";
import { storeTools } from "./store.ts";
import { orderTools } from "./orders.ts";
import { dashboardTools } from "./dashboard.ts";
import { locationTools } from "./locations.ts";
import { imageTools } from "./images.ts";

export const tools = [
  ...productTools,
  ...catalogTools,
  ...storeTools,
  ...orderTools,
  ...dashboardTools,
  ...locationTools,
  ...imageTools,
];
