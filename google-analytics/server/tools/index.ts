import { getAccountSummariesTool } from "./accounts.ts";
import {
  getCustomDimensionsAndMetricsTool,
  getPropertyDetailsTool,
} from "./properties.ts";
import { runRealtimeReportTool, runReportTool } from "./reports.ts";
import { listGoogleAdsLinksTool } from "./ads.ts";
import { listPropertyAnnotationsTool } from "./annotations.ts";

export const tools = [
  getAccountSummariesTool,
  getPropertyDetailsTool,
  getCustomDimensionsAndMetricsTool,
  runReportTool,
  runRealtimeReportTool,
  listGoogleAdsLinksTool,
  listPropertyAnnotationsTool,
];
