/**
 * Tag Management Tools
 *
 * Tools for managing GTM tags
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

const TagSchema = z.object({
  path: z.string().describe("Tag path"),
  accountId: z.string().describe("Account ID"),
  containerId: z.string().describe("Container ID"),
  workspaceId: z.string().describe("Workspace ID"),
  tagId: z.string().describe("Tag ID"),
  name: z.string().describe("Tag name"),
  type: z
    .string()
    .describe("Tag type (e.g., 'gtagua' for GA4, 'html' for Custom HTML)"),
  parameter: z.array(ParameterSchema).optional().describe("Tag parameters"),
  fingerprint: z.string().describe("Fingerprint for optimistic locking"),
  firingTriggerId: z
    .array(z.string())
    .optional()
    .describe("Triggers that fire this tag"),
  blockingTriggerId: z
    .array(z.string())
    .optional()
    .describe("Triggers that block this tag"),
  tagFiringOption: z
    .enum(["oncePerEvent", "oncePerLoad", "unlimited"])
    .optional(),
  notes: z.string().optional().describe("Tag notes"),
  scheduleStartMs: z
    .string()
    .optional()
    .describe("Schedule start time in milliseconds"),
  scheduleEndMs: z
    .string()
    .optional()
    .describe("Schedule end time in milliseconds"),
  liveOnly: z
    .boolean()
    .optional()
    .describe("Whether tag only fires in live mode"),
  tagManagerUrl: z.string().describe("Tag Manager URL for this tag"),
  parentFolderId: z.string().optional().describe("Parent folder ID"),
  paused: z.boolean().optional().describe("Whether tag is paused"),
});

// ============================================================================
// List Tags Tool
// ============================================================================

export const createListTagsTool = (env: Env) =>
  createPrivateTool({
    id: "list_tags",
    description:
      "List all tags in a GTM workspace. Returns tag IDs, names, types, and configurations.",
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
      tags: z.array(TagSchema).describe("List of tags"),
      nextPageToken: z
        .string()
        .optional()
        .describe("Token for fetching next page"),
    }),
    execute: async ({ context }) => {
      const client = new GTMClient({
        accessToken: getAccessToken(env),
      });

      const response = await client.listTags(
        context.accountId,
        context.containerId,
        context.workspaceId,
        context.pageToken,
      );

      return {
        tags: (response.tag || []).map((tag) => ({
          path: tag.path,
          accountId: tag.accountId,
          containerId: tag.containerId,
          workspaceId: tag.workspaceId,
          tagId: tag.tagId,
          name: tag.name,
          type: tag.type,
          parameter: tag.parameter,
          fingerprint: tag.fingerprint,
          firingTriggerId: tag.firingTriggerId,
          blockingTriggerId: tag.blockingTriggerId,
          tagFiringOption: tag.tagFiringOption,
          notes: tag.notes,
          scheduleStartMs: tag.scheduleStartMs,
          scheduleEndMs: tag.scheduleEndMs,
          liveOnly: tag.liveOnly,
          tagManagerUrl: tag.tagManagerUrl,
          parentFolderId: tag.parentFolderId,
          paused: tag.paused,
        })),
        nextPageToken: response.nextPageToken,
      };
    },
  });

// ============================================================================
// Get Tag Tool
// ============================================================================

export const createGetTagTool = (env: Env) =>
  createPrivateTool({
    id: "get_tag",
    description: "Get detailed information about a specific GTM tag.",
    inputSchema: z.object({
      accountId: z.string().describe("Account ID (e.g., '12345')"),
      containerId: z.string().describe("Container ID (e.g., '67890')"),
      workspaceId: z.string().describe("Workspace ID (e.g., '5')"),
      tagId: z.string().describe("Tag ID"),
    }),
    outputSchema: z.object({
      tag: TagSchema.describe("Tag details"),
    }),
    execute: async ({ context }) => {
      const client = new GTMClient({
        accessToken: getAccessToken(env),
      });

      const tag = await client.getTag(
        context.accountId,
        context.containerId,
        context.workspaceId,
        context.tagId,
      );

      return {
        tag: {
          path: tag.path,
          accountId: tag.accountId,
          containerId: tag.containerId,
          workspaceId: tag.workspaceId,
          tagId: tag.tagId,
          name: tag.name,
          type: tag.type,
          parameter: tag.parameter,
          fingerprint: tag.fingerprint,
          firingTriggerId: tag.firingTriggerId,
          blockingTriggerId: tag.blockingTriggerId,
          tagFiringOption: tag.tagFiringOption,
          notes: tag.notes,
          scheduleStartMs: tag.scheduleStartMs,
          scheduleEndMs: tag.scheduleEndMs,
          liveOnly: tag.liveOnly,
          tagManagerUrl: tag.tagManagerUrl,
          parentFolderId: tag.parentFolderId,
          paused: tag.paused,
        },
      };
    },
  });

// ============================================================================
// Create Tag Tool
// ============================================================================

export const createCreateTagTool = (env: Env) =>
  createPrivateTool({
    id: "create_tag",
    description:
      "Create a new tag in a GTM workspace. Tags fire based on triggers and execute tracking code or other functionality.",
    inputSchema: z.object({
      accountId: z.string().describe("Account ID (e.g., '12345')"),
      containerId: z.string().describe("Container ID (e.g., '67890')"),
      workspaceId: z.string().describe("Workspace ID (e.g., '5')"),
      name: z.string().describe("Tag name"),
      type: z
        .string()
        .describe("Tag type (e.g., 'gtagua' for GA4, 'html' for Custom HTML)"),
      parameter: z.array(ParameterSchema).optional().describe("Tag parameters"),
      firingTriggerId: z
        .array(z.string())
        .optional()
        .describe("Trigger IDs that fire this tag"),
      blockingTriggerId: z
        .array(z.string())
        .optional()
        .describe("Trigger IDs that block this tag"),
      tagFiringOption: z
        .enum(["oncePerEvent", "oncePerLoad", "unlimited"])
        .optional(),
      notes: z.string().optional().describe("Tag notes"),
      liveOnly: z
        .boolean()
        .optional()
        .describe("Whether tag only fires in live mode"),
      parentFolderId: z.string().optional().describe("Parent folder ID"),
      paused: z.boolean().optional().describe("Whether tag starts paused"),
    }),
    outputSchema: z.object({
      tag: TagSchema.describe("Created tag"),
    }),
    execute: async ({ context }) => {
      const client = new GTMClient({
        accessToken: getAccessToken(env),
      });

      const tag = await client.createTag(
        context.accountId,
        context.containerId,
        context.workspaceId,
        {
          name: context.name,
          type: context.type,
          parameter: context.parameter as Parameter[] | undefined,
          firingTriggerId: context.firingTriggerId,
          blockingTriggerId: context.blockingTriggerId,
          tagFiringOption: context.tagFiringOption,
          notes: context.notes,
          liveOnly: context.liveOnly,
          parentFolderId: context.parentFolderId,
          paused: context.paused,
        },
      );

      return {
        tag: {
          path: tag.path,
          accountId: tag.accountId,
          containerId: tag.containerId,
          workspaceId: tag.workspaceId,
          tagId: tag.tagId,
          name: tag.name,
          type: tag.type,
          parameter: tag.parameter,
          fingerprint: tag.fingerprint,
          firingTriggerId: tag.firingTriggerId,
          blockingTriggerId: tag.blockingTriggerId,
          tagFiringOption: tag.tagFiringOption,
          notes: tag.notes,
          scheduleStartMs: tag.scheduleStartMs,
          scheduleEndMs: tag.scheduleEndMs,
          liveOnly: tag.liveOnly,
          tagManagerUrl: tag.tagManagerUrl,
          parentFolderId: tag.parentFolderId,
          paused: tag.paused,
        },
      };
    },
  });

// ============================================================================
// Update Tag Tool
// ============================================================================

export const createUpdateTagTool = (env: Env) =>
  createPrivateTool({
    id: "update_tag",
    description:
      "Update an existing GTM tag. All fields from the original tag must be provided.",
    inputSchema: z.object({
      accountId: z.string().describe("Account ID (e.g., '12345')"),
      containerId: z.string().describe("Container ID (e.g., '67890')"),
      workspaceId: z.string().describe("Workspace ID (e.g., '5')"),
      tagId: z.string().describe("Tag ID to update"),
      fingerprint: z
        .string()
        .describe("Current fingerprint for optimistic locking"),
      name: z.string().describe("Tag name"),
      type: z.string().describe("Tag type (e.g., 'html', 'gtagua')"),
      parameter: z.array(ParameterSchema).optional().describe("Tag parameters"),
      firingTriggerId: z
        .array(z.string())
        .optional()
        .describe("Firing trigger IDs"),
      blockingTriggerId: z
        .array(z.string())
        .optional()
        .describe("Blocking trigger IDs"),
      tagFiringOption: z
        .enum(["oncePerEvent", "oncePerLoad", "unlimited"])
        .optional(),
      notes: z.string().optional().describe("Tag notes"),
      liveOnly: z
        .boolean()
        .optional()
        .describe("Whether tag only fires in live mode"),
      paused: z.boolean().optional().describe("Whether tag is paused"),
    }),
    outputSchema: z.object({
      tag: TagSchema.describe("Updated tag"),
    }),
    execute: async ({ context }) => {
      const client = new GTMClient({
        accessToken: getAccessToken(env),
      });

      const tag = await client.updateTag(
        context.accountId,
        context.containerId,
        context.workspaceId,
        context.tagId,
        {
          fingerprint: context.fingerprint,
          name: context.name,
          type: context.type,
          parameter: context.parameter as Parameter[] | undefined,
          firingTriggerId: context.firingTriggerId,
          blockingTriggerId: context.blockingTriggerId,
          tagFiringOption: context.tagFiringOption,
          notes: context.notes,
          liveOnly: context.liveOnly,
          paused: context.paused,
        },
      );

      return {
        tag: {
          path: tag.path,
          accountId: tag.accountId,
          containerId: tag.containerId,
          workspaceId: tag.workspaceId,
          tagId: tag.tagId,
          name: tag.name,
          type: tag.type,
          parameter: tag.parameter,
          fingerprint: tag.fingerprint,
          firingTriggerId: tag.firingTriggerId,
          blockingTriggerId: tag.blockingTriggerId,
          tagFiringOption: tag.tagFiringOption,
          notes: tag.notes,
          scheduleStartMs: tag.scheduleStartMs,
          scheduleEndMs: tag.scheduleEndMs,
          liveOnly: tag.liveOnly,
          tagManagerUrl: tag.tagManagerUrl,
          parentFolderId: tag.parentFolderId,
          paused: tag.paused,
        },
      };
    },
  });

// ============================================================================
// Delete Tag Tool
// ============================================================================

export const createDeleteTagTool = (env: Env) =>
  createPrivateTool({
    id: "delete_tag",
    description: "Delete a GTM tag. Warning: This action cannot be undone.",
    inputSchema: z.object({
      accountId: z.string().describe("Account ID (e.g., '12345')"),
      containerId: z.string().describe("Container ID (e.g., '67890')"),
      workspaceId: z.string().describe("Workspace ID (e.g., '5')"),
      tagId: z.string().describe("Tag ID to delete"),
    }),
    outputSchema: z.object({
      success: z.boolean().describe("Whether the deletion was successful"),
      message: z.string().describe("Result message"),
    }),
    execute: async ({ context }) => {
      const client = new GTMClient({
        accessToken: getAccessToken(env),
      });

      await client.deleteTag(
        context.accountId,
        context.containerId,
        context.workspaceId,
        context.tagId,
      );

      return {
        success: true,
        message: `Tag ${context.tagId} deleted successfully`,
      };
    },
  });

// ============================================================================
// Export all tag tools
// ============================================================================

export const tagTools = [
  createListTagsTool,
  createGetTagTool,
  createCreateTagTool,
  createUpdateTagTool,
  createDeleteTagTool,
];
