/**
 * Central export point for all tools organized by domain.
 *
 * Exports array of functions (createTool).
 * The runtime calls each function with env to create the tools.
 */
import {
  createSearchLogsTool,
  createGetLogDetailsTool,
  createQueryChartDataTool,
  createQuerySpansTool,
  createQueryMetricsTool,
  createGetServiceHealthTool,
  createCompareTimeRangesTool,
} from "./hyperdx.ts";
import { alertTools } from "./alerts.ts";
import { dashboardTools } from "./dashboards.ts";

// Export array of tool creator functions (same pattern as registry)
export const tools = [
  createSearchLogsTool,
  createGetLogDetailsTool,
  createQueryChartDataTool,
  createQuerySpansTool,
  createQueryMetricsTool,
  createGetServiceHealthTool,
  createCompareTimeRangesTool,
  ...alertTools,
  ...dashboardTools,
];
