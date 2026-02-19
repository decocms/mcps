/**
 * REPORTS_GET Tool
 *
 * Retrieves a single report by ID with full sections.
 * Fetches the Markdown file from GitHub, parses frontmatter + body,
 * and merges lifecycle status.
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
  parseLifecycleStatuses,
  parseReport,
} from "../lib/report-parser.ts";

const ReportStatusEnum = z.enum(["passing", "warning", "failing", "info"]);

const MetricItemSchema = z.object({
  label: z.string(),
  value: z.union([z.number(), z.string()]),
  unit: z.string().optional(),
  previousValue: z.union([z.number(), z.string()]).optional(),
  status: ReportStatusEnum.optional(),
});

const CriterionItemSchema = z.object({
  label: z.string(),
  description: z.string().optional(),
});

const RankedListRowSchema = z.object({
  position: z.number(),
  delta: z.number(),
  label: z.string(),
  image: z.string(),
  values: z.array(z.union([z.string(), z.number()])),
  note: z.string().optional(),
});

const ReportSectionSchema = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("markdown"),
    content: z.string(),
  }),
  z.object({
    type: z.literal("metrics"),
    title: z.string().optional(),
    items: z.array(MetricItemSchema),
  }),
  z.object({
    type: z.literal("table"),
    title: z.string().optional(),
    columns: z.array(z.string()),
    rows: z.array(z.array(z.union([z.string(), z.number(), z.null()]))),
  }),
  z.object({
    type: z.literal("criteria"),
    title: z.string().optional(),
    items: z.array(CriterionItemSchema),
  }),
  z.object({
    type: z.literal("note"),
    content: z.string(),
  }),
  z.object({
    type: z.literal("ranked-list"),
    title: z.string().optional(),
    columns: z.array(z.string()),
    rows: z.array(RankedListRowSchema),
  }),
]);

export const createReportsGetTool = (env: Env) =>
  createPrivateTool({
    id: "REPORTS_GET",
    description:
      "Get a specific report with full content including all sections.",
    inputSchema: z.object({
      id: z
        .string()
        .describe("Report identifier (relative path without .md extension)"),
    }),
    outputSchema: z.object({
      id: z.string(),
      title: z.string(),
      category: z.string(),
      status: ReportStatusEnum,
      summary: z.string(),
      updatedAt: z.string(),
      source: z.string().optional(),
      tags: z.array(z.string()).optional(),
      lifecycleStatus: z.enum(["unread", "read", "dismissed"]).optional(),
      sections: z.array(ReportSectionSchema),
    }),
    execute: async ({ context }) => {
      const config = getRepoConfig(env);
      const client = getGitHubClient(env);

      const repoParams = {
        owner: config.owner,
        repo: config.repo,
        branch: config.branch,
      };

      // Build the full file path from the report ID
      const filePath = `${config.path}/${context.id}.md`;

      // Fetch the file content and lifecycle statuses in parallel
      const [fileResult, lifecycleStatuses] = await Promise.all([
        client.getFileContent(repoParams, filePath),
        fetchLifecycleStatuses(client, config),
      ]);

      if (!fileResult) {
        throw new Error(`Report "${context.id}" not found`);
      }

      const report = parseReport(
        fileResult.content,
        filePath,
        config.path,
        lifecycleStatuses,
      );

      return report;
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
