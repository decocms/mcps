/**
 * REPORTS_UPDATE_STATUS Tool (Optional)
 *
 * Updates the lifecycle status of a report (unread / read / dismissed).
 * Persists state in a `.reports-status.json` file within the reports
 * directory in the GitHub repository.
 */

import { createPrivateTool } from "@decocms/runtime/tools";
import { z } from "zod";
import type { Env } from "../types/env.ts";
import {
  getGitHubClient,
  getRepoConfig,
  getStatusFilePath,
} from "../lib/config.ts";
import {
  type LifecycleStatusMap,
  type ReportLifecycleStatus,
  parseLifecycleStatuses,
} from "../lib/report-parser.ts";

export const createReportsUpdateStatusTool = (env: Env) =>
  createPrivateTool({
    id: "REPORTS_UPDATE_STATUS",
    description:
      "Update the lifecycle status of a report (unread, read, or dismissed).",
    inputSchema: z.object({
      reportId: z.string().describe("Report identifier"),
      lifecycleStatus: z
        .enum(["unread", "read", "dismissed"])
        .describe("New lifecycle status"),
    }),
    outputSchema: z.object({
      success: z.boolean(),
      message: z.string().optional(),
    }),
    execute: async ({ context }) => {
      const config = getRepoConfig(env);
      const client = getGitHubClient(env);

      const repoParams = {
        owner: config.owner,
        repo: config.repo,
        branch: config.branch,
      };

      const statusPath = getStatusFilePath(config.path);

      // Fetch the current status file (may not exist yet)
      const existing = await client.getFileContent(repoParams, statusPath);

      let statuses: LifecycleStatusMap = {};
      if (existing) {
        statuses = parseLifecycleStatuses(existing.content);
      }

      // Update the entry
      const newStatus = context.lifecycleStatus as ReportLifecycleStatus;

      // If setting to "unread" (the default), remove the entry to keep the file small
      if (newStatus === "unread") {
        delete statuses[context.reportId];
      } else {
        statuses[context.reportId] = newStatus;
      }

      // Serialize and commit back
      const content = JSON.stringify(statuses, null, 2);
      const commitMessage = `chore(reports): update status for ${context.reportId} → ${context.lifecycleStatus}`;

      await client.putFileContent(
        repoParams,
        statusPath,
        content,
        commitMessage,
        existing?.sha,
      );

      return {
        success: true,
        message: `Report "${context.reportId}" marked as ${context.lifecycleStatus}`,
      };
    },
  });
