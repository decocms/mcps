import {
  MAGENTO_CANCELLATION_RATE_RESOURCE_URI,
  MAGENTO_ORDERS_SALES_CARD_RESOURCE_URI,
  MAGENTO_ORDERS_TIMELINE_RESOURCE_URI,
  MAGENTO_STATUS_BREAKDOWN_RESOURCE_URI,
  MAGENTO_TOP_PRODUCTS_RESOURCE_URI,
} from "../constants.ts";
import { createMcpAppResource } from "./mcp-app-resource.ts";

export const ordersTimelineResource = createMcpAppResource({
  uri: MAGENTO_ORDERS_TIMELINE_RESOURCE_URI,
  name: "Magento Orders Timeline",
  description: "MCP App UI for today's hourly orders bar chart.",
  htmlFile: "orders-timeline.html",
});

export const ordersSalesCardResource = createMcpAppResource({
  uri: MAGENTO_ORDERS_SALES_CARD_RESOURCE_URI,
  name: "Magento Orders Sales Card",
  description:
    "MCP App UI for sales summary cards (today, last hour, last 5 minutes).",
  htmlFile: "orders-sales-card.html",
});

export const cancellationRateResource = createMcpAppResource({
  uri: MAGENTO_CANCELLATION_RATE_RESOURCE_URI,
  name: "Magento Cancellation Rate",
  description:
    "MCP App UI for the order cancellation rate card (today, 7d, 30d).",
  htmlFile: "cancellation-rate.html",
});

export const topProductsResource = createMcpAppResource({
  uri: MAGENTO_TOP_PRODUCTS_RESOURCE_URI,
  name: "Magento Top Products",
  description: "MCP App UI for the top selling products list (today, 7d, 30d).",
  htmlFile: "top-products.html",
});

export const statusBreakdownResource = createMcpAppResource({
  uri: MAGENTO_STATUS_BREAKDOWN_RESOURCE_URI,
  name: "Magento Status Breakdown",
  description:
    "MCP App UI for the orders-by-status donut chart (today, 7d, 30d).",
  htmlFile: "status-breakdown.html",
});
