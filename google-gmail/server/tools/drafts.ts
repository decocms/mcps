/**
 * Draft Management Tools
 *
 * Tools for listing, creating, updating, sending, and deleting drafts
 */

import { createPrivateTool } from "@decocms/runtime/tools";
import { z } from "zod";
import type { Env } from "../main.ts";
import { GmailClient, getAccessToken } from "../lib/gmail-client.ts";

// ============================================================================
// Schema Definitions
// ============================================================================

const DraftMessageSchema = z.object({
  id: z.string().describe("Message ID"),
  threadId: z.string().describe("Thread ID"),
});

const DraftSchema = z.object({
  id: z.string().describe("Draft ID"),
  message: DraftMessageSchema.describe("Associated message"),
});

const ParsedDraftSchema = z.object({
  id: z.string().describe("Draft ID"),
  messageId: z.string().describe("Message ID"),
  threadId: z.string().describe("Thread ID"),
  to: z.string().optional().describe("Recipient"),
  subject: z.string().optional().describe("Subject"),
  snippet: z.string().optional().describe("Content snippet"),
  bodyText: z.string().optional().describe("Plain text body"),
});

// ============================================================================
// List Drafts Tool
// ============================================================================

export const createListDraftsTool = (env: Env) =>
  createPrivateTool({
    id: "list_drafts",
    description: "List all draft emails in the mailbox.",
    inputSchema: z.object({
      maxResults: z.coerce
        .number()
        .int()
        .min(1)
        .max(500)
        .optional()
        .describe("Maximum number of drafts to return (default: 50)"),
      pageToken: z.string().optional().describe("Token for pagination"),
      q: z.string().optional().describe("Gmail search query to filter drafts"),
    }),
    outputSchema: z.object({
      drafts: z.array(DraftSchema).describe("List of drafts"),
      nextPageToken: z.string().optional().describe("Token for next page"),
    }),
    execute: async ({ context }) => {
      const client = new GmailClient({
        accessToken: getAccessToken(env),
      });

      const result = await client.listDrafts({
        maxResults: context.maxResults,
        pageToken: context.pageToken,
        q: context.q,
      });

      return {
        drafts: result.drafts.map((d) => ({
          id: d.id,
          message: d.message,
        })),
        nextPageToken: result.nextPageToken,
      };
    },
  });

// ============================================================================
// Get Draft Tool
// ============================================================================

export const createGetDraftTool = (env: Env) =>
  createPrivateTool({
    id: "get_draft",
    description: "Get a specific draft with its full content.",
    inputSchema: z.object({
      id: z.string().describe("Draft ID"),
    }),
    outputSchema: z.object({
      draft: ParsedDraftSchema.describe("Draft details"),
    }),
    execute: async ({ context }) => {
      const client = new GmailClient({
        accessToken: getAccessToken(env),
      });

      const draft = await client.getDraft(context.id, "full");
      const parsed = client.parseMessage(draft.message);

      return {
        draft: {
          id: draft.id,
          messageId: draft.message.id,
          threadId: draft.message.threadId,
          to: parsed.to,
          subject: parsed.subject,
          snippet: parsed.snippet,
          bodyText: parsed.bodyText,
        },
      };
    },
  });

// ============================================================================
// Create Draft Tool
// ============================================================================

export const createCreateDraftTool = (env: Env) =>
  createPrivateTool({
    id: "create_draft",
    description:
      "Create a new draft email. The draft will be saved but not sent until you use send_draft.",
    inputSchema: z.object({
      to: z.string().describe("Recipient email address (required)"),
      subject: z.string().describe("Email subject (required)"),
      body: z
        .string()
        .describe("Email body content (HTML supported, required)"),
      cc: z.string().optional().describe("CC recipients (comma-separated)"),
      bcc: z.string().optional().describe("BCC recipients (comma-separated)"),
      replyTo: z.string().optional().describe("Reply-To address"),
      threadId: z.string().optional().describe("Thread ID for reply drafts"),
    }),
    outputSchema: z.object({
      draft: DraftSchema.describe("Created draft"),
      success: z.boolean().describe("Whether creation was successful"),
    }),
    execute: async ({ context }) => {
      const client = new GmailClient({
        accessToken: getAccessToken(env),
      });

      const draft = await client.createDraft({
        to: context.to,
        subject: context.subject,
        body: context.body,
        cc: context.cc,
        bcc: context.bcc,
        replyTo: context.replyTo,
        threadId: context.threadId,
      });

      return {
        draft: {
          id: draft.id,
          message: {
            id: draft.message.id,
            threadId: draft.message.threadId,
          },
        },
        success: true,
      };
    },
  });

// ============================================================================
// Update Draft Tool
// ============================================================================

export const createUpdateDraftTool = (env: Env) =>
  createPrivateTool({
    id: "update_draft",
    description: "Update an existing draft's content.",
    inputSchema: z.object({
      id: z.string().describe("Draft ID to update"),
      to: z.string().describe("Recipient email address (required)"),
      subject: z.string().describe("Email subject (required)"),
      body: z.string().describe("Email body content (required)"),
      cc: z.string().optional().describe("CC recipients"),
      bcc: z.string().optional().describe("BCC recipients"),
    }),
    outputSchema: z.object({
      draft: DraftSchema.describe("Updated draft"),
      success: z.boolean().describe("Whether update was successful"),
    }),
    execute: async ({ context }) => {
      const client = new GmailClient({
        accessToken: getAccessToken(env),
      });

      const draft = await client.updateDraft(context.id, {
        to: context.to,
        subject: context.subject,
        body: context.body,
        cc: context.cc,
        bcc: context.bcc,
      });

      return {
        draft: {
          id: draft.id,
          message: {
            id: draft.message.id,
            threadId: draft.message.threadId,
          },
        },
        success: true,
      };
    },
  });

// ============================================================================
// Send Draft Tool
// ============================================================================

export const createSendDraftTool = (env: Env) =>
  createPrivateTool({
    id: "send_draft",
    description:
      "Send an existing draft. The draft will be moved from Drafts to Sent.",
    inputSchema: z.object({
      id: z.string().describe("Draft ID to send"),
    }),
    outputSchema: z.object({
      messageId: z.string().describe("ID of the sent message"),
      threadId: z.string().describe("Thread ID of the sent message"),
      success: z.boolean().describe("Whether sending was successful"),
    }),
    execute: async ({ context }) => {
      const client = new GmailClient({
        accessToken: getAccessToken(env),
      });

      const result = await client.sendDraft(context.id);

      return {
        messageId: result.id,
        threadId: result.threadId,
        success: true,
      };
    },
  });

// ============================================================================
// Delete Draft Tool
// ============================================================================

export const createDeleteDraftTool = (env: Env) =>
  createPrivateTool({
    id: "delete_draft",
    description: "Permanently delete a draft. This cannot be undone.",
    inputSchema: z.object({
      id: z.string().describe("Draft ID to delete"),
    }),
    outputSchema: z.object({
      success: z.boolean().describe("Whether deletion was successful"),
      message: z.string().describe("Result message"),
    }),
    execute: async ({ context }) => {
      const client = new GmailClient({
        accessToken: getAccessToken(env),
      });

      await client.deleteDraft(context.id);

      return {
        success: true,
        message: `Draft ${context.id} deleted successfully`,
      };
    },
  });

// ============================================================================
// Export all draft tools
// ============================================================================

export const draftTools = [
  createListDraftsTool,
  createGetDraftTool,
  createCreateDraftTool,
  createUpdateDraftTool,
  createSendDraftTool,
  createDeleteDraftTool,
];
