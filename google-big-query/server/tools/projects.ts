/**
 * BigQuery Projects Tools
 *
 * Tools for listing projects
 */

import { createPrivateTool } from "@decocms/runtime/tools";
import { z } from "zod";
import type { Env } from "../main.ts";
import { BigQueryClient, getAccessToken } from "../lib/bigquery-client.ts";

// ============================================================================
// Schema Definitions
// ============================================================================

const ProjectSchema = z.object({
  id: z.string().describe("Full project ID"),
  projectId: z.string().describe("Project ID"),
  numericId: z.string().optional().describe("Numeric project ID"),
  friendlyName: z.string().optional().describe("Project friendly name"),
});

// ============================================================================
// List Projects Tool
// ============================================================================

export const createListProjectsTool = (env: Env) =>
  createPrivateTool({
    id: "bigquery_list_projects",
    description:
      "List all Google Cloud projects accessible to the authenticated user. Returns project IDs and friendly names. Use this to discover which projects you can query.",
    inputSchema: z.object({
      maxResults: z.coerce
        .number()
        .int()
        .min(1)
        .max(1000)
        .optional()
        .describe("Maximum number of projects to return"),
      pageToken: z
        .string()
        .optional()
        .describe("Token for fetching next page of results"),
    }),
    outputSchema: z.object({
      projects: z.array(ProjectSchema).describe("List of projects"),
      nextPageToken: z
        .string()
        .optional()
        .describe("Token for fetching next page"),
      totalItems: z.number().optional().describe("Total number of projects"),
    }),
    execute: async ({ context }) => {
      const client = new BigQueryClient({
        accessToken: getAccessToken(env),
      });

      const response = await client.listProjects({
        maxResults: context.maxResults,
        pageToken: context.pageToken,
      });

      const projects = (response.projects || []).map((p) => ({
        id: p.id,
        projectId: p.projectReference.projectId,
        numericId: p.numericId,
        friendlyName: p.friendlyName,
      }));

      return {
        projects,
        nextPageToken: response.nextPageToken,
        totalItems: response.totalItems,
      };
    },
  });

// ============================================================================
// Export all Projects tools
// ============================================================================

export const projectsTools = [createListProjectsTool];
