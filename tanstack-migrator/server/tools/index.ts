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
  createAssigneeListTool,
  createSiteArchiveTool,
  createSiteAssignTool,
  createSiteCatalogSearchTool,
  createSiteSuggestionsTool,
  createSiteDeleteTool,
  createSiteEnqueueTool,
  createSiteGetTool,
  createSiteListTool,
  createSiteMarkDoneTool,
  createSitePauseTool,
  createSiteRegisterTool,
  createSiteReorderTool,
  createSiteResumeTool,
  createSiteResetTool,
  createSiteRetryTool,
  createSiteSetPlatformTool,
  createSiteTerminalTool,
} from "./sites.ts";
import { createSyncDecofileInstallTool } from "./sync.ts";

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
  createSiteResetTool,
  createSiteSetPlatformTool,
  createSiteEnqueueTool,
  createSiteReorderTool,
  createSiteMarkDoneTool,
  createSiteArchiveTool,
  createSiteAssignTool,
  createAssigneeListTool,
  createSiteCatalogSearchTool,
  createSiteSuggestionsTool,
  createSiteDeleteTool,
  createSyncDecofileInstallTool,
  createParityReportUrlsTool,
  createReportProgressTool,
  createAdvanceQueueTool,
  createGithubProbeTool,
  createSandboxTestTool,
  createSandboxExecTool,
  createSiteSetStatusTool,
];
