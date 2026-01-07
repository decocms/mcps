/**
 * Trigger Management Tools
 *
 * Tools for managing GTM triggers
 */

import { createPrivateTool } from "@decocms/runtime/tools";
import { z } from "zod";
import type { Env } from "../main.ts";
import { GTMClient, getAccessToken } from "../lib/gtm-client.ts";
import type { Parameter, Condition } from "../lib/types.ts";

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

const ConditionSchema = z.object({
  type: z.enum([
    "equals",
    "contains",
    "startsWith",
    "endsWith",
    "matchRegex",
    "greater",
    "greaterOrEquals",
    "less",
    "lessOrEquals",
    "cssSelector",
    "urlMatches",
  ]),
  parameter: z.array(ParameterSchema).optional(),
});

const TriggerSchema = z.object({
  path: z.string().describe("Trigger path"),
  accountId: z.string().describe("Account ID"),
  containerId: z.string().describe("Container ID"),
  workspaceId: z.string().describe("Workspace ID"),
  triggerId: z.string().describe("Trigger ID"),
  name: z.string().describe("Trigger name"),
  type: z
    .string()
    .describe("Trigger type (e.g., 'pageview', 'customEvent', 'click')"),
  filter: z.array(ConditionSchema).optional().describe("Filter conditions"),
  autoEventFilter: z
    .array(ConditionSchema)
    .optional()
    .describe("Auto-event filter conditions"),
  customEventFilter: z
    .array(ConditionSchema)
    .optional()
    .describe("Custom event filter conditions"),
  eventName: ParameterSchema.optional().describe("Event name parameter"),
  fingerprint: z.string().describe("Fingerprint for optimistic locking"),
  notes: z.string().optional().describe("Trigger notes"),
  tagManagerUrl: z.string().describe("Tag Manager URL for this trigger"),
  parentFolderId: z.string().optional().describe("Parent folder ID"),
});

// ============================================================================
// List Triggers Tool
// ============================================================================

export const createListTriggersTool = (env: Env) =>
  createPrivateTool({
    id: "list_triggers",
    description:
      "List all triggers in a GTM workspace. Returns trigger IDs, names, types, and conditions.",
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
      triggers: z.array(TriggerSchema).describe("List of triggers"),
      nextPageToken: z
        .string()
        .optional()
        .describe("Token for fetching next page"),
    }),
    execute: async ({ context }) => {
      const client = new GTMClient({
        accessToken: getAccessToken(env),
      });

      const response = await client.listTriggers(
        context.accountId,
        context.containerId,
        context.workspaceId,
        context.pageToken,
      );

      return {
        triggers: (response.trigger || []).map((trigger) => ({
          path: trigger.path,
          accountId: trigger.accountId,
          containerId: trigger.containerId,
          workspaceId: trigger.workspaceId,
          triggerId: trigger.triggerId,
          name: trigger.name,
          type: trigger.type,
          filter: trigger.filter,
          autoEventFilter: trigger.autoEventFilter,
          customEventFilter: trigger.customEventFilter,
          eventName: trigger.eventName,
          fingerprint: trigger.fingerprint,
          notes: trigger.notes,
          tagManagerUrl: trigger.tagManagerUrl,
          parentFolderId: trigger.parentFolderId,
        })),
        nextPageToken: response.nextPageToken,
      };
    },
  });

// ============================================================================
// Get Trigger Tool
// ============================================================================

export const createGetTriggerTool = (env: Env) =>
  createPrivateTool({
    id: "get_trigger",
    description: "Get detailed information about a specific GTM trigger.",
    inputSchema: z.object({
      accountId: z.string().describe("Account ID (e.g., '12345')"),
      containerId: z.string().describe("Container ID (e.g., '67890')"),
      workspaceId: z.string().describe("Workspace ID (e.g., '5')"),
      triggerId: z.string().describe("Trigger ID"),
    }),
    outputSchema: z.object({
      trigger: TriggerSchema.describe("Trigger details"),
    }),
    execute: async ({ context }) => {
      const client = new GTMClient({
        accessToken: getAccessToken(env),
      });

      const trigger = await client.getTrigger(
        context.accountId,
        context.containerId,
        context.workspaceId,
        context.triggerId,
      );

      return {
        trigger: {
          path: trigger.path,
          accountId: trigger.accountId,
          containerId: trigger.containerId,
          workspaceId: trigger.workspaceId,
          triggerId: trigger.triggerId,
          name: trigger.name,
          type: trigger.type,
          filter: trigger.filter,
          autoEventFilter: trigger.autoEventFilter,
          customEventFilter: trigger.customEventFilter,
          eventName: trigger.eventName,
          fingerprint: trigger.fingerprint,
          notes: trigger.notes,
          tagManagerUrl: trigger.tagManagerUrl,
          parentFolderId: trigger.parentFolderId,
        },
      };
    },
  });

// ============================================================================
// Create Trigger Tool
// ============================================================================

export const createCreateTriggerTool = (env: Env) =>
  createPrivateTool({
    id: "create_trigger",
    description:
      "Create a new trigger in a GTM workspace. Triggers determine when tags should fire.",
    inputSchema: z.object({
      accountId: z.string().describe("Account ID (e.g., '12345')"),
      containerId: z.string().describe("Container ID (e.g., '67890')"),
      workspaceId: z.string().describe("Workspace ID (e.g., '5')"),
      name: z.string().describe("Trigger name"),
      type: z
        .string()
        .describe("Trigger type (e.g., 'pageview', 'customEvent', 'click')"),
      filter: z.array(ConditionSchema).optional().describe("Filter conditions"),
      autoEventFilter: z
        .array(ConditionSchema)
        .optional()
        .describe("Auto-event filter conditions"),
      customEventFilter: z
        .array(ConditionSchema)
        .optional()
        .describe("Custom event filter conditions"),
      eventName: ParameterSchema.optional().describe(
        "Event name parameter for custom events",
      ),
      notes: z.string().optional().describe("Trigger notes"),
      parentFolderId: z.string().optional().describe("Parent folder ID"),
    }),
    outputSchema: z.object({
      trigger: TriggerSchema.describe("Created trigger"),
    }),
    execute: async ({ context }) => {
      const client = new GTMClient({
        accessToken: getAccessToken(env),
      });

      const trigger = await client.createTrigger(
        context.accountId,
        context.containerId,
        context.workspaceId,
        {
          name: context.name,
          type: context.type,
          filter: context.filter as Condition[] | undefined,
          autoEventFilter: context.autoEventFilter as Condition[] | undefined,
          customEventFilter: context.customEventFilter as
            | Condition[]
            | undefined,
          eventName: context.eventName as Parameter | undefined,
          notes: context.notes,
          parentFolderId: context.parentFolderId,
        },
      );

      return {
        trigger: {
          path: trigger.path,
          accountId: trigger.accountId,
          containerId: trigger.containerId,
          workspaceId: trigger.workspaceId,
          triggerId: trigger.triggerId,
          name: trigger.name,
          type: trigger.type,
          filter: trigger.filter,
          autoEventFilter: trigger.autoEventFilter,
          customEventFilter: trigger.customEventFilter,
          eventName: trigger.eventName,
          fingerprint: trigger.fingerprint,
          notes: trigger.notes,
          tagManagerUrl: trigger.tagManagerUrl,
          parentFolderId: trigger.parentFolderId,
        },
      };
    },
  });

// ============================================================================
// Update Trigger Tool
// ============================================================================

export const createUpdateTriggerTool = (env: Env) =>
  createPrivateTool({
    id: "update_trigger",
    description:
      "Update an existing GTM trigger. All fields from the original trigger must be provided.",
    inputSchema: z.object({
      accountId: z.string().describe("Account ID (e.g., '12345')"),
      containerId: z.string().describe("Container ID (e.g., '67890')"),
      workspaceId: z.string().describe("Workspace ID (e.g., '5')"),
      triggerId: z.string().describe("Trigger ID to update"),
      fingerprint: z
        .string()
        .describe("Current fingerprint for optimistic locking"),
      name: z.string().describe("Trigger name"),
      type: z.string().describe("Trigger type (e.g., 'pageview', 'click')"),
      filter: z.array(ConditionSchema).optional().describe("Filter conditions"),
      autoEventFilter: z
        .array(ConditionSchema)
        .optional()
        .describe("Auto-event filter conditions"),
      customEventFilter: z
        .array(ConditionSchema)
        .optional()
        .describe("Custom event filter conditions"),
      eventName: ParameterSchema.optional().describe("Event name parameter"),
      notes: z.string().optional().describe("Trigger notes"),
    }),
    outputSchema: z.object({
      trigger: TriggerSchema.describe("Updated trigger"),
    }),
    execute: async ({ context }) => {
      const client = new GTMClient({
        accessToken: getAccessToken(env),
      });

      const trigger = await client.updateTrigger(
        context.accountId,
        context.containerId,
        context.workspaceId,
        context.triggerId,
        {
          fingerprint: context.fingerprint,
          name: context.name,
          type: context.type,
          filter: context.filter as Condition[] | undefined,
          autoEventFilter: context.autoEventFilter as Condition[] | undefined,
          customEventFilter: context.customEventFilter as
            | Condition[]
            | undefined,
          eventName: context.eventName as Parameter | undefined,
          notes: context.notes,
        },
      );

      return {
        trigger: {
          path: trigger.path,
          accountId: trigger.accountId,
          containerId: trigger.containerId,
          workspaceId: trigger.workspaceId,
          triggerId: trigger.triggerId,
          name: trigger.name,
          type: trigger.type,
          filter: trigger.filter,
          autoEventFilter: trigger.autoEventFilter,
          customEventFilter: trigger.customEventFilter,
          eventName: trigger.eventName,
          fingerprint: trigger.fingerprint,
          notes: trigger.notes,
          tagManagerUrl: trigger.tagManagerUrl,
          parentFolderId: trigger.parentFolderId,
        },
      };
    },
  });

// ============================================================================
// Delete Trigger Tool
// ============================================================================

export const createDeleteTriggerTool = (env: Env) =>
  createPrivateTool({
    id: "delete_trigger",
    description: "Delete a GTM trigger. Warning: This action cannot be undone.",
    inputSchema: z.object({
      accountId: z.string().describe("Account ID (e.g., '12345')"),
      containerId: z.string().describe("Container ID (e.g., '67890')"),
      workspaceId: z.string().describe("Workspace ID (e.g., '5')"),
      triggerId: z.string().describe("Trigger ID to delete"),
    }),
    outputSchema: z.object({
      success: z.boolean().describe("Whether the deletion was successful"),
      message: z.string().describe("Result message"),
    }),
    execute: async ({ context }) => {
      const client = new GTMClient({
        accessToken: getAccessToken(env),
      });

      await client.deleteTrigger(
        context.accountId,
        context.containerId,
        context.workspaceId,
        context.triggerId,
      );

      return {
        success: true,
        message: `Trigger ${context.triggerId} deleted successfully`,
      };
    },
  });

// ============================================================================
// Export all trigger tools
// ============================================================================

export const triggerTools = [
  createListTriggersTool,
  createGetTriggerTool,
  createCreateTriggerTool,
  createUpdateTriggerTool,
  createDeleteTriggerTool,
];
