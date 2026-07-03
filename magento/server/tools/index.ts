/**
 * Central export point for all Magento tools.
 *
 * Registry tools are curated hand-written wrappers over the Magento 2 REST
 * API. Custom tools power the MCP App UI widgets (analytics over /V1/orders).
 */
import { registryTools } from "./registry.ts";

// ── Custom tools (MCP App UI widgets) ────────────────────────────────────────
import { ordersTimeline } from "./custom/orders-timeline.ts";
import { ordersSalesCard } from "./custom/orders-sales-card.ts";
import { cancellationRate } from "./custom/cancellation-rate.ts";
import { topProducts } from "./custom/top-products.ts";
import { statusBreakdown } from "./custom/status-breakdown.ts";

const customFactories = [
  // Today's orders timeline chart (MCP App UI)
  ordersTimeline,
  // Sales summary card for today / last hour / last 5 min (MCP App UI)
  ordersSalesCard,
  // Cancellation rate card for today / 7d / 30d (MCP App UI)
  cancellationRate,
  // Top selling products for today / 7d / 30d (MCP App UI)
  topProducts,
  // Orders by status donut for today / 7d / 30d (MCP App UI)
  statusBreakdown,
];

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const tools = [...registryTools, ...customFactories] as any[];
