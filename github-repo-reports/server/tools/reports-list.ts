/**
 * REPORTS_LIST Tool
 *
 * Lists available reports with optional filtering by category and status.
 * Fetches all Markdown files from the configured GitHub repo directory,
 * parses YAML frontmatter for metadata, and merges lifecycle statuses.
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
  type ReportStatus,
  type ReportSummary,
  parseLifecycleStatuses,
  parseReportSummary,
} from "../lib/report-parser.ts";

const ReportStatusEnum = z.enum(["passing", "warning", "failing", "info"]);

export const createReportsListTool = (env: Env) =>
  createPrivateTool({
    id: "REPORTS_LIST",
    description:
      "List available reports with optional filters. Returns report summaries (metadata only, no sections).",
    inputSchema: z.object({
      category: z
        .string()
        .optional()
        .describe("Filter by category (e.g., 'performance', 'security')"),
      status: ReportStatusEnum.optional().describe(
        "Filter by report status (passing, warning, failing, info)",
      ),
    }),
    outputSchema: z.object({
      reports: z.array(
        z.object({
          id: z.string(),
          title: z.string(),
          category: z.string(),
          status: ReportStatusEnum,
          summary: z.string(),
          updatedAt: z.string(),
          source: z.string().optional(),
          tags: z.array(z.string()).optional(),
          lifecycleStatus: z.enum(["unread", "read", "dismissed"]).optional(),
        }),
      ),
    }),
    execute: async ({ context }) => {
      const config = getRepoConfig(env);
      const client = getGitHubClient(env);

      const repoParams = {
        owner: config.owner,
        repo: config.repo,
        branch: config.branch,
      };

      // Fetch the directory tree and lifecycle statuses in parallel
      const [treeEntries, lifecycleStatuses] = await Promise.all([
        client.listMarkdownFiles(repoParams, config.path),
        fetchLifecycleStatuses(client, config),
      ]);

      if (treeEntries.length === 0) {
        return { reports: [] };
      }

      // Fetch all file contents in parallel via the Blob API
      const contentPromises = treeEntries.map(async (entry) => {
        try {
          const content = await client.getBlobContent(
            config.owner,
            config.repo,
            entry.sha,
          );
          return { path: entry.path, content };
        } catch (error) {
          console.error(
            `[reports] Failed to fetch blob for ${entry.path}:`,
            error,
          );
          return null;
        }
      });

      const fileContents = (await Promise.all(contentPromises)).filter(
        (item): item is { path: string; content: string } => item !== null,
      );

      // Parse each file into a ReportSummary
      let reports: ReportSummary[] = fileContents.map((file) =>
        parseReportSummary(
          file.content,
          file.path,
          config.path,
          lifecycleStatuses,
        ),
      );

      // Apply filters
      if (context.category) {
        reports = reports.filter((r) => r.category === context.category);
      }
      if (context.status) {
        reports = reports.filter(
          (r) => r.status === (context.status as ReportStatus),
        );
      }

      // Sort by updatedAt descending (most recent first)
      reports.sort(
        (a, b) =>
          new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime(),
      );

      return { reports };
    },
  });

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

interface RepoConfig {
  owner: string;
  repo: string;
  branch: string;
  path: string;
}

async function fetchLifecycleStatuses(
  client: ReturnType<typeof getGitHubClient>,
  config: RepoConfig,
): Promise<LifecycleStatusMap> {
  const statusPath = getStatusFilePath(config.path);
  const file = await client.getFileContent(
    { owner: config.owner, repo: config.repo, branch: config.branch },
    statusPath,
  );

  if (!file) {
    return {};
  }

  return parseLifecycleStatuses(file.content);
}
