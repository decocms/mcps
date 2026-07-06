import { createAdvanceQueueTool, createGithubProbeTool } from "./admin.ts";
import { createDashboardTool } from "./dashboard.ts";
import { createActiveWidgetTool, createQueueWidgetTool } from "./widgets.ts";
import { createReportProgressTool } from "./progress.ts";
import { createParityReportUrlsTool } from "./reports.ts";
import {
  createSandboxExecTool,
  createSandboxTestTool,
  createSiteSetStatusTool,
} from "./sandbox-test.ts";
import {
  createSiteArchiveTool,
  createSiteAssignTool,
  createSiteDeleteTool,
  createSiteEnqueueTool,
  createSiteGetTool,
  createSiteListTool,
  createSiteMarkDoneTool,
  createSitePauseTool,
  createSiteRegisterTool,
  createSiteReorderTool,
  createSiteResumeTool,
  createSiteRetryTool,
  createSiteTerminalTool,
} from "./sites.ts";

export const tools = [
  createDashboardTool,
  createActiveWidgetTool,
  createQueueWidgetTool,
  createSiteRegisterTool,
  createSiteListTool,
  createSiteGetTool,
  createSiteTerminalTool,
  createSitePauseTool,
  createSiteResumeTool,
  createSiteRetryTool,
  createSiteEnqueueTool,
  createSiteReorderTool,
  createSiteMarkDoneTool,
  createSiteArchiveTool,
  createSiteAssignTool,
  createSiteDeleteTool,
  createParityReportUrlsTool,
  createReportProgressTool,
  createAdvanceQueueTool,
  createGithubProbeTool,
  createSandboxTestTool,
  createSandboxExecTool,
  createSiteSetStatusTool,
];
