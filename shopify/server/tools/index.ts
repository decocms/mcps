/**
 * Central export point for all Shopify tools. Every tool is a read-only query
 * except the theme-file write tools (themeWriteTools), which are the MCP's only
 * mutations.
 */
import { analyticsTools } from "./analytics.ts";
import { b2bTools } from "./b2b.ts";
import { contentTools } from "./content.ts";
import { customerTools } from "./customers.ts";
import { discountTools } from "./discounts.ts";
import { fulfillmentTools } from "./fulfillment.ts";
import { inventoryTools } from "./inventory.ts";
import { orderTools } from "./orders.ts";
import { paymentTools } from "./payments.ts";
import { productTools } from "./products.ts";
import { storeTools } from "./store.ts";
import { themeWriteTools } from "./themes.ts";

export const tools = [
  ...productTools,
  ...orderTools,
  ...fulfillmentTools,
  ...inventoryTools,
  ...customerTools,
  ...discountTools,
  ...contentTools,
  ...storeTools,
  ...b2bTools,
  ...paymentTools,
  ...analyticsTools,
  ...themeWriteTools,
];
