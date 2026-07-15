/**
 * Central export point for all Shopify tools (all read-only).
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
];
