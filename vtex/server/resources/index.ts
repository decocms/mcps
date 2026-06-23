import {
  VTEX_ORDERS_SALES_CARD_RESOURCE_URI,
  VTEX_ORDERS_TIMELINE_RESOURCE_URI,
} from "../constants.ts";
import { createMcpAppResource } from "./mcp-app-resource.ts";

export const ordersTimelineResource = createMcpAppResource({
  uri: VTEX_ORDERS_TIMELINE_RESOURCE_URI,
  name: "VTEX Orders Timeline",
  description: "MCP App UI for today's hourly orders bar chart.",
  htmlFile: "orders-timeline.html",
});

export const ordersSalesCardResource = createMcpAppResource({
  uri: VTEX_ORDERS_SALES_CARD_RESOURCE_URI,
  name: "VTEX Orders Sales Card",
  description:
    "MCP App UI for sales summary cards (today, last hour, last 5 minutes).",
  htmlFile: "orders-sales-card.html",
});
