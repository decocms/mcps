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
  createSiteDeleteTool,
  createSiteGetTool,
  createSiteListTool,
  createSiteMarkDoneTool,
  createSitePauseTool,
  createSiteRegisterTool,
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
  createSiteMarkDoneTool,
  createSiteArchiveTool,
  createSiteDeleteTool,
  createParityReportUrlsTool,
  createReportProgressTool,
  createAdvanceQueueTool,
  createGithubProbeTool,
  createSandboxTestTool,
  createSandboxExecTool,
  createSiteSetStatusTool,
];
