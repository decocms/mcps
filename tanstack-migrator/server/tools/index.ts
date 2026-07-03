import { createAdvanceQueueTool } from "./admin.ts";
import { createDashboardTool } from "./dashboard.ts";
import { createReportProgressTool } from "./progress.ts";
import { createParityReportUrlsTool } from "./reports.ts";
import {
  createSiteArchiveTool,
  createSiteDeleteTool,
  createSiteGetTool,
  createSiteListTool,
  createSiteMarkDoneTool,
  createSitePauseTool,
  createSiteRegisterTool,
  createSiteResumeTool,
  createSiteRetryTool,
} from "./sites.ts";

export const tools = [
  createDashboardTool,
  createSiteRegisterTool,
  createSiteListTool,
  createSiteGetTool,
  createSitePauseTool,
  createSiteResumeTool,
  createSiteRetryTool,
  createSiteMarkDoneTool,
  createSiteArchiveTool,
  createSiteDeleteTool,
  createParityReportUrlsTool,
  createReportProgressTool,
  createAdvanceQueueTool,
];
