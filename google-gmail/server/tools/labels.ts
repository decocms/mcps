/**
 * Label Management Tools
 *
 * Tools for listing, creating, updating, and deleting labels
 */

import { createPrivateTool } from "@decocms/runtime/tools";
import { z } from "zod";
import type { Env } from "../main.ts";
import { GmailClient, getAccessToken } from "../lib/gmail-client.ts";

// ============================================================================
// Schema Definitions
// ============================================================================

const LabelColorSchema = z.object({
  textColor: z.string().optional().describe("Text color hex code"),
  backgroundColor: z.string().optional().describe("Background color hex code"),
});

const LabelSchema = z.object({
  id: z.string().describe("Label ID"),
  name: z.string().describe("Label name"),
  type: z.enum(["system", "user"]).describe("Label type (system or user)"),
  messageListVisibility: z
    .enum(["show", "hide"])
    .optional()
    .describe("Show in message list"),
  labelListVisibility: z
    .enum(["labelShow", "labelShowIfUnread", "labelHide"])
    .optional()
    .describe("Show in label list"),
  messagesTotal: z.number().optional().describe("Total messages with label"),
  messagesUnread: z.number().optional().describe("Unread messages with label"),
  threadsTotal: z.number().optional().describe("Total threads with label"),
  threadsUnread: z.number().optional().describe("Unread threads with label"),
  color: LabelColorSchema.optional().describe("Label color"),
});

// ============================================================================
// List Labels Tool
// ============================================================================

export const createListLabelsTool = (env: Env) =>
  createPrivateTool({
    id: "list_labels",
    description:
      "List all labels in the mailbox, including system labels (INBOX, SENT, etc.) and user-created labels.",
    inputSchema: z.object({}),
    outputSchema: z.object({
      labels: z.array(LabelSchema).describe("List of all labels"),
      systemLabels: z
        .array(LabelSchema)
        .describe("System labels (INBOX, SENT, etc.)"),
      userLabels: z.array(LabelSchema).describe("User-created labels"),
    }),
    execute: async ({ context: _context }) => {
      const client = new GmailClient({
        accessToken: getAccessToken(env),
      });

      const labels = await client.listLabels();

      const systemLabels = labels.filter((l) => l.type === "system");
      const userLabels = labels.filter((l) => l.type === "user");

      return {
        labels,
        systemLabels,
        userLabels,
      };
    },
  });

// ============================================================================
// Get Label Tool
// ============================================================================

export const createGetLabelTool = (env: Env) =>
  createPrivateTool({
    id: "get_label",
    description:
      "Get details of a specific label including message counts and visibility settings.",
    inputSchema: z.object({
      id: z.string().describe("Label ID (e.g., 'INBOX', 'SENT', or custom ID)"),
    }),
    outputSchema: z.object({
      label: LabelSchema.describe("Label details"),
    }),
    execute: async ({ context }) => {
      const client = new GmailClient({
        accessToken: getAccessToken(env),
      });

      const label = await client.getLabel(context.id);

      return { label };
    },
  });

// ============================================================================
// Create Label Tool
// ============================================================================

export const createCreateLabelTool = (env: Env) =>
  createPrivateTool({
    id: "create_label",
    description: "Create a new custom label for organizing emails.",
    inputSchema: z.object({
      name: z.string().describe("Label name (required)"),
      messageListVisibility: z
        .enum(["show", "hide"])
        .optional()
        .describe("Show label in message list (default: show)"),
      labelListVisibility: z
        .enum(["labelShow", "labelShowIfUnread", "labelHide"])
        .optional()
        .describe("Show label in label list (default: labelShow)"),
      backgroundColor: z
        .string()
        .optional()
        .describe("Background color hex code (e.g., '#ff0000')"),
      textColor: z
        .string()
        .optional()
        .describe("Text color hex code (e.g., '#ffffff')"),
    }),
    outputSchema: z.object({
      label: LabelSchema.describe("Created label"),
      success: z.boolean().describe("Whether creation was successful"),
    }),
    execute: async ({ context }) => {
      const client = new GmailClient({
        accessToken: getAccessToken(env),
      });

      const color =
        context.backgroundColor || context.textColor
          ? {
              backgroundColor: context.backgroundColor,
              textColor: context.textColor,
            }
          : undefined;

      const label = await client.createLabel({
        name: context.name,
        messageListVisibility: context.messageListVisibility,
        labelListVisibility: context.labelListVisibility,
        color,
      });

      return {
        label,
        success: true,
      };
    },
  });

// ============================================================================
// Update Label Tool
// ============================================================================

export const createUpdateLabelTool = (env: Env) =>
  createPrivateTool({
    id: "update_label",
    description:
      "Update a label's name, color, or visibility settings. Only user-created labels can be modified.",
    inputSchema: z.object({
      id: z.string().describe("Label ID to update"),
      name: z.string().optional().describe("New label name"),
      messageListVisibility: z
        .enum(["show", "hide"])
        .optional()
        .describe("Show in message list"),
      labelListVisibility: z
        .enum(["labelShow", "labelShowIfUnread", "labelHide"])
        .optional()
        .describe("Show in label list"),
      backgroundColor: z.string().optional().describe("New background color"),
      textColor: z.string().optional().describe("New text color"),
    }),
    outputSchema: z.object({
      label: LabelSchema.describe("Updated label"),
      success: z.boolean().describe("Whether update was successful"),
    }),
    execute: async ({ context }) => {
      const client = new GmailClient({
        accessToken: getAccessToken(env),
      });

      const color =
        context.backgroundColor || context.textColor
          ? {
              backgroundColor: context.backgroundColor,
              textColor: context.textColor,
            }
          : undefined;

      const label = await client.updateLabel({
        id: context.id,
        name: context.name,
        messageListVisibility: context.messageListVisibility,
        labelListVisibility: context.labelListVisibility,
        color,
      });

      return {
        label,
        success: true,
      };
    },
  });

// ============================================================================
// Delete Label Tool
// ============================================================================

export const createDeleteLabelTool = (env: Env) =>
  createPrivateTool({
    id: "delete_label",
    description:
      "Delete a user-created label. System labels cannot be deleted. Messages with this label will keep their content but lose the label association.",
    inputSchema: z.object({
      id: z.string().describe("Label ID to delete"),
    }),
    outputSchema: z.object({
      success: z.boolean().describe("Whether deletion was successful"),
      message: z.string().describe("Result message"),
    }),
    execute: async ({ context }) => {
      const client = new GmailClient({
        accessToken: getAccessToken(env),
      });

      await client.deleteLabel(context.id);

      return {
        success: true,
        message: `Label ${context.id} deleted successfully`,
      };
    },
  });

// ============================================================================
// Export all label tools
// ============================================================================

export const labelTools = [
  createListLabelsTool,
  createGetLabelTool,
  createCreateLabelTool,
  createUpdateLabelTool,
  createDeleteLabelTool,
];
