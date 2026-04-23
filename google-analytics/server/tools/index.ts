import { getAccountSummariesTool } from "./accounts.ts";
import { getPropertyDetailsTool, getCustomDimensionsAndMetricsTool } from "./properties.ts";
import { runReportTool, runRealtimeReportTool } from "./reports.ts";
import { listGoogleAdsLinksTool } from "./ads.ts";

export const tools = [
  getAccountSummariesTool,
  getPropertyDetailsTool,
  getCustomDimensionsAndMetricsTool,
  runReportTool,
  runRealtimeReportTool,
  listGoogleAdsLinksTool,
];
