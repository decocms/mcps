/**
 * Workspace Management Tools
 *
 * Tools for managing GTM workspaces
 */

import { createPrivateTool } from "@decocms/runtime/tools";
import { z } from "zod";
import type { Env } from "../main.ts";
import { GTMClient, getAccessToken } from "../lib/gtm-client.ts";

// ============================================================================
// Schema Definitions
// ============================================================================

const WorkspaceSchema = z.object({
  path: z.string().describe("Workspace path"),
  accountId: z.string().describe("Account ID"),
  containerId: z.string().describe("Container ID"),
  workspaceId: z.string().describe("Workspace ID"),
  name: z.string().describe("Workspace name"),
  description: z.string().optional().describe("Workspace description"),
  fingerprint: z.string().describe("Fingerprint for optimistic locking"),
  tagManagerUrl: z.string().describe("Tag Manager URL for this workspace"),
});

// ============================================================================
// List Workspaces Tool
// ============================================================================

export const createListWorkspacesTool = (env: Env) =>
  createPrivateTool({
    id: "list_workspaces",
    description:
      "List all workspaces in a GTM container. Returns workspace IDs, names, and descriptions.",
    inputSchema: z.object({
      accountId: z.string().describe("Account ID (e.g., '12345')"),
      containerId: z.string().describe("Container ID (e.g., '67890')"),
      pageToken: z
        .string()
        .optional()
        .describe("Token for fetching next page of results"),
    }),
    outputSchema: z.object({
      workspaces: z.array(WorkspaceSchema).describe("List of workspaces"),
      nextPageToken: z
        .string()
        .optional()
        .describe("Token for fetching next page"),
    }),
    execute: async ({ context }) => {
      const client = new GTMClient({
        accessToken: getAccessToken(env),
      });

      const response = await client.listWorkspaces(
        context.accountId,
        context.containerId,
        context.pageToken,
      );

      return {
        workspaces: (response.workspace || []).map((ws) => ({
          path: ws.path,
          accountId: ws.accountId,
          containerId: ws.containerId,
          workspaceId: ws.workspaceId,
          name: ws.name,
          description: ws.description,
          fingerprint: ws.fingerprint,
          tagManagerUrl: ws.tagManagerUrl,
        })),
        nextPageToken: response.nextPageToken,
      };
    },
  });

// ============================================================================
// Get Workspace Tool
// ============================================================================

export const createGetWorkspaceTool = (env: Env) =>
  createPrivateTool({
    id: "get_workspace",
    description: "Get detailed information about a specific GTM workspace.",
    inputSchema: z.object({
      accountId: z.string().describe("Account ID (e.g., '12345')"),
      containerId: z.string().describe("Container ID (e.g., '67890')"),
      workspaceId: z.string().describe("Workspace ID (e.g., '5')"),
    }),
    outputSchema: z.object({
      workspace: WorkspaceSchema.describe("Workspace details"),
    }),
    execute: async ({ context }) => {
      const client = new GTMClient({
        accessToken: getAccessToken(env),
      });

      const workspace = await client.getWorkspace(
        context.accountId,
        context.containerId,
        context.workspaceId,
      );

      return {
        workspace: {
          path: workspace.path,
          accountId: workspace.accountId,
          containerId: workspace.containerId,
          workspaceId: workspace.workspaceId,
          name: workspace.name,
          description: workspace.description,
          fingerprint: workspace.fingerprint,
          tagManagerUrl: workspace.tagManagerUrl,
        },
      };
    },
  });

// ============================================================================
// Create Workspace Tool
// ============================================================================

export const createCreateWorkspaceTool = (env: Env) =>
  createPrivateTool({
    id: "create_workspace",
    description:
      "Create a new workspace in a GTM container. Workspaces allow you to work on container changes without affecting the live version.",
    inputSchema: z.object({
      accountId: z.string().describe("Account ID (e.g., '12345')"),
      containerId: z.string().describe("Container ID (e.g., '67890')"),
      name: z.string().describe("Workspace name"),
      description: z.string().describe("Workspace description"),
    }),
    outputSchema: z.object({
      workspace: WorkspaceSchema.describe("Created workspace"),
    }),
    execute: async ({ context }) => {
      const client = new GTMClient({
        accessToken: getAccessToken(env),
      });

      const workspace = await client.createWorkspace(
        context.accountId,
        context.containerId,
        {
          name: context.name,
          description: context.description,
        },
      );

      return {
        workspace: {
          path: workspace.path,
          accountId: workspace.accountId,
          containerId: workspace.containerId,
          workspaceId: workspace.workspaceId,
          name: workspace.name,
          description: workspace.description,
          fingerprint: workspace.fingerprint,
          tagManagerUrl: workspace.tagManagerUrl,
        },
      };
    },
  });

// ============================================================================
// Export all workspace tools
// ============================================================================

export const workspaceTools = [
  createListWorkspacesTool,
  createGetWorkspaceTool,
  createCreateWorkspaceTool,
];
