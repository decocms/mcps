/**
 * Variable Management Tools
 *
 * Tools for managing GTM variables
 */

import { createPrivateTool } from "@decocms/runtime/tools";
import { z } from "zod";
import type { Env } from "../main.ts";
import { GTMClient, getAccessToken } from "../lib/gtm-client.ts";
import type { Parameter } from "../lib/types.ts";

// ============================================================================
// Schema Definitions
// ============================================================================

const ParameterSchema: z.ZodTypeAny = z.lazy(() =>
  z.object({
    type: z.enum([
      "template",
      "integer",
      "boolean",
      "list",
      "map",
      "tagReference",
    ]),
    key: z.string().optional(),
    value: z.string().optional(),
    list: z.array(ParameterSchema).optional(),
    map: z.array(ParameterSchema).optional(),
    isWeakReference: z.boolean().optional(),
  }),
);

const VariableSchema = z.object({
  path: z.string().describe("Variable path"),
  accountId: z.string().describe("Account ID"),
  containerId: z.string().describe("Container ID"),
  workspaceId: z.string().describe("Workspace ID"),
  variableId: z.string().describe("Variable ID"),
  name: z.string().describe("Variable name"),
  type: z
    .string()
    .describe("Variable type (e.g., 'v' for Data Layer, 'c' for Constant)"),
  parameter: z
    .array(ParameterSchema)
    .optional()
    .describe("Variable parameters"),
  fingerprint: z.string().describe("Fingerprint for optimistic locking"),
  notes: z.string().optional().describe("Variable notes"),
  scheduleStartMs: z
    .string()
    .optional()
    .describe("Schedule start time in milliseconds"),
  scheduleEndMs: z
    .string()
    .optional()
    .describe("Schedule end time in milliseconds"),
  disablingTriggerId: z
    .array(z.string())
    .optional()
    .describe("Triggers that disable this variable"),
  enablingTriggerId: z
    .array(z.string())
    .optional()
    .describe("Triggers that enable this variable"),
  tagManagerUrl: z.string().describe("Tag Manager URL for this variable"),
  parentFolderId: z.string().optional().describe("Parent folder ID"),
  formatValue: ParameterSchema.optional().describe("Format value parameter"),
});

// ============================================================================
// List Variables Tool
// ============================================================================

export const createListVariablesTool = (env: Env) =>
  createPrivateTool({
    id: "list_variables",
    description:
      "List all variables in a GTM workspace. Returns variable IDs, names, types, and configurations.",
    inputSchema: z.object({
      accountId: z.string().describe("Account ID (e.g., '12345')"),
      containerId: z.string().describe("Container ID (e.g., '67890')"),
      workspaceId: z.string().describe("Workspace ID (e.g., '5')"),
      pageToken: z
        .string()
        .optional()
        .describe("Token for fetching next page of results"),
    }),
    outputSchema: z.object({
      variables: z.array(VariableSchema).describe("List of variables"),
      nextPageToken: z
        .string()
        .optional()
        .describe("Token for fetching next page"),
    }),
    execute: async ({ context }) => {
      const client = new GTMClient({
        accessToken: getAccessToken(env),
      });

      const response = await client.listVariables(
        context.accountId,
        context.containerId,
        context.workspaceId,
        context.pageToken,
      );

      return {
        variables: (response.variable || []).map((variable) => ({
          path: variable.path,
          accountId: variable.accountId,
          containerId: variable.containerId,
          workspaceId: variable.workspaceId,
          variableId: variable.variableId,
          name: variable.name,
          type: variable.type,
          parameter: variable.parameter,
          fingerprint: variable.fingerprint,
          notes: variable.notes,
          scheduleStartMs: variable.scheduleStartMs,
          scheduleEndMs: variable.scheduleEndMs,
          disablingTriggerId: variable.disablingTriggerId,
          enablingTriggerId: variable.enablingTriggerId,
          tagManagerUrl: variable.tagManagerUrl,
          parentFolderId: variable.parentFolderId,
          formatValue: variable.formatValue,
        })),
        nextPageToken: response.nextPageToken,
      };
    },
  });

// ============================================================================
// Get Variable Tool
// ============================================================================

export const createGetVariableTool = (env: Env) =>
  createPrivateTool({
    id: "get_variable",
    description: "Get detailed information about a specific GTM variable.",
    inputSchema: z.object({
      accountId: z.string().describe("Account ID (e.g., '12345')"),
      containerId: z.string().describe("Container ID (e.g., '67890')"),
      workspaceId: z.string().describe("Workspace ID (e.g., '5')"),
      variableId: z.string().describe("Variable ID"),
    }),
    outputSchema: z.object({
      variable: VariableSchema.describe("Variable details"),
    }),
    execute: async ({ context }) => {
      const client = new GTMClient({
        accessToken: getAccessToken(env),
      });

      const variable = await client.getVariable(
        context.accountId,
        context.containerId,
        context.workspaceId,
        context.variableId,
      );

      return {
        variable: {
          path: variable.path,
          accountId: variable.accountId,
          containerId: variable.containerId,
          workspaceId: variable.workspaceId,
          variableId: variable.variableId,
          name: variable.name,
          type: variable.type,
          parameter: variable.parameter,
          fingerprint: variable.fingerprint,
          notes: variable.notes,
          scheduleStartMs: variable.scheduleStartMs,
          scheduleEndMs: variable.scheduleEndMs,
          disablingTriggerId: variable.disablingTriggerId,
          enablingTriggerId: variable.enablingTriggerId,
          tagManagerUrl: variable.tagManagerUrl,
          parentFolderId: variable.parentFolderId,
          formatValue: variable.formatValue,
        },
      };
    },
  });

// ============================================================================
// Create Variable Tool
// ============================================================================

export const createCreateVariableTool = (env: Env) =>
  createPrivateTool({
    id: "create_variable",
    description:
      "Create a new variable in a GTM workspace. Variables store reusable values.",
    inputSchema: z.object({
      accountId: z.string().describe("Account ID (e.g., '12345')"),
      containerId: z.string().describe("Container ID (e.g., '67890')"),
      workspaceId: z.string().describe("Workspace ID (e.g., '5')"),
      name: z.string().describe("Variable name"),
      type: z
        .string()
        .describe(
          "Variable type (e.g., 'v' for Data Layer, 'c' for Constant, 'jsm' for JavaScript)",
        ),
      parameter: z
        .array(ParameterSchema)
        .optional()
        .describe("Variable parameters"),
      notes: z.string().optional().describe("Variable notes"),
      parentFolderId: z.string().optional().describe("Parent folder ID"),
      disablingTriggerId: z
        .array(z.string())
        .optional()
        .describe("Triggers that disable this variable"),
      enablingTriggerId: z
        .array(z.string())
        .optional()
        .describe("Triggers that enable this variable"),
    }),
    outputSchema: z.object({
      variable: VariableSchema.describe("Created variable"),
    }),
    execute: async ({ context }) => {
      const client = new GTMClient({
        accessToken: getAccessToken(env),
      });

      const variable = await client.createVariable(
        context.accountId,
        context.containerId,
        context.workspaceId,
        {
          name: context.name,
          type: context.type,
          parameter: context.parameter as Parameter[] | undefined,
          notes: context.notes,
          parentFolderId: context.parentFolderId,
          disablingTriggerId: context.disablingTriggerId,
          enablingTriggerId: context.enablingTriggerId,
        },
      );

      return {
        variable: {
          path: variable.path,
          accountId: variable.accountId,
          containerId: variable.containerId,
          workspaceId: variable.workspaceId,
          variableId: variable.variableId,
          name: variable.name,
          type: variable.type,
          parameter: variable.parameter,
          fingerprint: variable.fingerprint,
          notes: variable.notes,
          scheduleStartMs: variable.scheduleStartMs,
          scheduleEndMs: variable.scheduleEndMs,
          disablingTriggerId: variable.disablingTriggerId,
          enablingTriggerId: variable.enablingTriggerId,
          tagManagerUrl: variable.tagManagerUrl,
          parentFolderId: variable.parentFolderId,
          formatValue: variable.formatValue,
        },
      };
    },
  });

// ============================================================================
// Update Variable Tool
// ============================================================================

export const createUpdateVariableTool = (env: Env) =>
  createPrivateTool({
    id: "update_variable",
    description:
      "Update an existing GTM variable. All fields from the original variable must be provided.",
    inputSchema: z.object({
      accountId: z.string().describe("Account ID (e.g., '12345')"),
      containerId: z.string().describe("Container ID (e.g., '67890')"),
      workspaceId: z.string().describe("Workspace ID (e.g., '5')"),
      variableId: z.string().describe("Variable ID to update"),
      fingerprint: z
        .string()
        .describe("Current fingerprint for optimistic locking"),
      name: z.string().describe("Variable name"),
      type: z.string().describe("Variable type (e.g., 'c', 'v', 'jsm')"),
      parameter: z
        .array(ParameterSchema)
        .optional()
        .describe("Variable parameters"),
      notes: z.string().optional().describe("Variable notes"),
      disablingTriggerId: z
        .array(z.string())
        .optional()
        .describe("Disabling trigger IDs"),
      enablingTriggerId: z
        .array(z.string())
        .optional()
        .describe("Enabling trigger IDs"),
    }),
    outputSchema: z.object({
      variable: VariableSchema.describe("Updated variable"),
    }),
    execute: async ({ context }) => {
      const client = new GTMClient({
        accessToken: getAccessToken(env),
      });

      const variable = await client.updateVariable(
        context.accountId,
        context.containerId,
        context.workspaceId,
        context.variableId,
        {
          fingerprint: context.fingerprint,
          name: context.name,
          type: context.type,
          parameter: context.parameter as Parameter[] | undefined,
          notes: context.notes,
          disablingTriggerId: context.disablingTriggerId,
          enablingTriggerId: context.enablingTriggerId,
        },
      );

      return {
        variable: {
          path: variable.path,
          accountId: variable.accountId,
          containerId: variable.containerId,
          workspaceId: variable.workspaceId,
          variableId: variable.variableId,
          name: variable.name,
          type: variable.type,
          parameter: variable.parameter,
          fingerprint: variable.fingerprint,
          notes: variable.notes,
          scheduleStartMs: variable.scheduleStartMs,
          scheduleEndMs: variable.scheduleEndMs,
          disablingTriggerId: variable.disablingTriggerId,
          enablingTriggerId: variable.enablingTriggerId,
          tagManagerUrl: variable.tagManagerUrl,
          parentFolderId: variable.parentFolderId,
          formatValue: variable.formatValue,
        },
      };
    },
  });

// ============================================================================
// Delete Variable Tool
// ============================================================================

export const createDeleteVariableTool = (env: Env) =>
  createPrivateTool({
    id: "delete_variable",
    description:
      "Delete a GTM variable. Warning: This action cannot be undone.",
    inputSchema: z.object({
      accountId: z.string().describe("Account ID (e.g., '12345')"),
      containerId: z.string().describe("Container ID (e.g., '67890')"),
      workspaceId: z.string().describe("Workspace ID (e.g., '5')"),
      variableId: z.string().describe("Variable ID to delete"),
    }),
    outputSchema: z.object({
      success: z.boolean().describe("Whether the deletion was successful"),
      message: z.string().describe("Result message"),
    }),
    execute: async ({ context }) => {
      const client = new GTMClient({
        accessToken: getAccessToken(env),
      });

      await client.deleteVariable(
        context.accountId,
        context.containerId,
        context.workspaceId,
        context.variableId,
      );

      return {
        success: true,
        message: `Variable ${context.variableId} deleted successfully`,
      };
    },
  });

// ============================================================================
// Export all variable tools
// ============================================================================

export const variableTools = [
  createListVariablesTool,
  createGetVariableTool,
  createCreateVariableTool,
  createUpdateVariableTool,
  createDeleteVariableTool,
];
