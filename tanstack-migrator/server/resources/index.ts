import { DASHBOARD_RESOURCE_URI } from "../constants.ts";
import { createMcpAppResource } from "./mcp-app-resource.ts";

export const dashboardResource = createMcpAppResource({
  uri: DASHBOARD_RESOURCE_URI,
  name: "TanStack Migrator Dashboard",
  description:
    "Migration queue with parity scores, needs-human list, finished sites and parity reports.",
  htmlFile: "dashboard.html",
});
