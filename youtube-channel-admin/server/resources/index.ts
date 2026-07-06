import {
  DASHBOARD_RESOURCE_URI,
  WIDGET_ALERTS_RESOURCE_URI,
  WIDGET_LIVES_RESOURCE_URI,
  WIDGET_PERFORMANCE_RESOURCE_URI,
  WIDGET_TOP_VIDEOS_RESOURCE_URI,
} from "../constants.ts";
import { createMcpAppResource } from "./mcp-app-resource.ts";

export const dashboardResource = createMcpAppResource({
  uri: DASHBOARD_RESOURCE_URI,
  name: "YouTube Channel Dashboard",
  description:
    "Channel overview: performance, top videos, alerts and recent uploads.",
  htmlFile: "dashboard.html",
});

export const widgetTopVideosResource = createMcpAppResource({
  uri: WIDGET_TOP_VIDEOS_RESOURCE_URI,
  name: "YouTube — Top videos",
  description: "Home widget: best performing videos of the last 28 days.",
  htmlFile: "widget-top-videos.html",
});

export const widgetPerformanceResource = createMcpAppResource({
  uri: WIDGET_PERFORMANCE_RESOURCE_URI,
  name: "YouTube — Channel performance",
  description: "Home widget: 28-day views/watch-time/subscribers summary.",
  htmlFile: "widget-performance.html",
});

export const widgetAlertsResource = createMcpAppResource({
  uri: WIDGET_ALERTS_RESOURCE_URI,
  name: "YouTube — Alerts",
  description:
    "Home widget: videos with upload/processing problems and comments held for review.",
  htmlFile: "widget-alerts.html",
});

export const widgetLivesResource = createMcpAppResource({
  uri: WIDGET_LIVES_RESOURCE_URI,
  name: "YouTube — Lives & Estreias",
  description:
    "Home widget: upcoming and active live broadcasts and Premieres.",
  htmlFile: "widget-lives.html",
});
