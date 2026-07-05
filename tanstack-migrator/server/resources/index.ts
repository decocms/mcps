import {
  DASHBOARD_RESOURCE_URI,
  WIDGET_ACTIVE_RESOURCE_URI,
  WIDGET_QUEUE_RESOURCE_URI,
} from "../constants.ts";
import { createMcpAppResource } from "./mcp-app-resource.ts";

export const dashboardResource = createMcpAppResource({
  uri: DASHBOARD_RESOURCE_URI,
  name: "TanStack Migrator Dashboard",
  description:
    "Migration queue with parity scores, needs-human list, finished sites and parity reports.",
  htmlFile: "dashboard.html",
});

export const widgetActiveResource = createMcpAppResource({
  uri: WIDGET_ACTIVE_RESOURCE_URI,
  name: "TanStack Migrator — Migrando agora",
  description: "Home widget: the storefront being migrated right now.",
  htmlFile: "widget-active.html",
});

export const widgetQueueResource = createMcpAppResource({
  uri: WIDGET_QUEUE_RESOURCE_URI,
  name: "TanStack Migrator — Fila",
  description: "Home widget: migration queue list and totals.",
  htmlFile: "widget-queue.html",
});
