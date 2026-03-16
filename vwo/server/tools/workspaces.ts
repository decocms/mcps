import { createPrivateTool } from "@decocms/runtime/tools";
import { z } from "zod";
import type { Env } from "../types/env.ts";
import { getApiToken } from "../lib/env.ts";
import { VWOClient } from "../lib/vwo-client.ts";

export const createListWorkspacesTool = (env: Env) =>
  createPrivateTool({
    id: "vwo_list_workspaces",
    description: "List all VWO workspaces/accounts.",
    inputSchema: z.object({
      includeCurrent: z
        .string()
        .optional()
        .describe(
          "Include currently authenticated workspace ('true' or 'false')",
        ),
      status: z
        .string()
        .optional()
        .describe("Filter by status: 'active', 'disabled', or 'all'"),
    }),
    execute: async ({ context }) => {
      const client = new VWOClient(getApiToken(env));
      return await client.listWorkspaces({
        includeCurrent: context.includeCurrent,
        status: context.status,
      });
    },
  });

export const createGetWorkspaceTool = (env: Env) =>
  createPrivateTool({
    id: "vwo_get_workspace",
    description:
      "Get details of a specific VWO workspace including timezone, company info, and status.",
    inputSchema: z.object({
      accountId: z
        .string()
        .optional()
        .describe("Workspace ID. Use 'current' for main workspace."),
    }),
    execute: async ({ context }) => {
      const client = new VWOClient(getApiToken(env));
      const accountId =
        context.accountId ||
        env.MESH_REQUEST_CONTEXT?.state?.accountId ||
        "current";
      return await client.getWorkspace(accountId);
    },
  });

export const createCreateWorkspaceTool = (env: Env) =>
  createPrivateTool({
    id: "vwo_create_workspace",
    description: "Create a new VWO workspace.",
    inputSchema: z.object({
      name: z.string().describe("Name for the new workspace"),
    }),
    execute: async ({ context }) => {
      const client = new VWOClient(getApiToken(env));
      return await client.createWorkspace({ name: context.name });
    },
  });

export const workspaceTools = [
  createListWorkspacesTool,
  createGetWorkspaceTool,
  createCreateWorkspaceTool,
];
