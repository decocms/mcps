// Built single-file web apps, inlined as strings at build time (vite `?raw`).
// `bun run build:web` must run before the worker build so these exist.
import salesCardHtml from "../../dist/client/orders-sales-card.html?raw";
import timelineHtml from "../../dist/client/orders-timeline.html?raw";
import {
  VTEX_ORDERS_SALES_CARD_RESOURCE_URI,
  VTEX_ORDERS_TIMELINE_RESOURCE_URI,
} from "../constants.ts";
import { createMcpAppResource } from "./mcp-app-resource.ts";

export const ordersTimelineResource = createMcpAppResource({
  uri: VTEX_ORDERS_TIMELINE_RESOURCE_URI,
  name: "VTEX Orders Timeline",
  description: "MCP App UI for today's hourly orders bar chart.",
  html: timelineHtml,
});

export const ordersSalesCardResource = createMcpAppResource({
  uri: VTEX_ORDERS_SALES_CARD_RESOURCE_URI,
  name: "VTEX Orders Sales Card",
  description:
    "MCP App UI for sales summary cards (today, last hour, last 5 minutes).",
  html: salesCardHtml,
});
