/** All tools provided by the Grafana MCP (registered in main.ts). */

import {
  createListDatasourcesTool,
  createQueryPrometheusTool,
  createQueryTool,
} from "./datasources.ts";
import {
  createGetDashboardTool,
  createSearchDashboardsTool,
} from "./dashboards.ts";

export const tools = [
  createListDatasourcesTool,
  createQueryTool,
  createQueryPrometheusTool,
  createSearchDashboardsTool,
  createGetDashboardTool,
];
