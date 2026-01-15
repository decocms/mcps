/**
 * Thread Management Tools
 *
 * Tools for listing, getting, and managing email threads (conversations)
 */

import { createPrivateTool } from "@decocms/runtime/tools";
import { z } from "zod";
import type { Env } from "../main.ts";
import { GmailClient, getAccessToken } from "../lib/gmail-client.ts";

// ============================================================================
// Schema Definitions
// ============================================================================

const ParsedMessageSchema = z.object({
  id: z.string().describe("Message ID"),
  threadId: z.string().describe("Thread ID"),
  labelIds: z.array(z.string()).describe("Label IDs"),
  snippet: z.string().describe("Short snippet"),
  from: z.string().optional().describe("Sender"),
  to: z.string().optional().describe("Recipient"),
  subject: z.string().optional().describe("Subject"),
  date: z.string().optional().describe("Date"),
  bodyText: z.string().optional().describe("Plain text body"),
});

const ThreadSchema = z.object({
  id: z.string().describe("Thread ID"),
  snippet: z.string().optional().describe("Thread snippet"),
  historyId: z.string().optional().describe("History ID"),
  messages: z
    .array(ParsedMessageSchema)
    .optional()
    .describe("Messages in the thread"),
});

// ============================================================================
// List Threads Tool
// ============================================================================

export const createListThreadsTool = (env: Env) =>
  createPrivateTool({
    id: "gmail_list_conversations",
    description:
      "List email conversations (threads) from Gmail. A conversation groups all related emails together (replies, forwards, etc.).",
    inputSchema: z.object({
      maxResults: z.coerce
        .number()
        .int()
        .min(1)
        .max(500)
        .optional()
        .describe("Maximum number of threads to return (default: 50)"),
      pageToken: z.string().optional().describe("Token for pagination"),
      q: z
        .string()
        .optional()
        .describe(
          "Gmail search query (e.g., 'is:unread', 'from:john@example.com')",
        ),
      labelIds: z
        .array(z.string())
        .optional()
        .describe("Filter by label IDs (e.g., ['INBOX'])"),
      includeSpamTrash: z
        .boolean()
        .optional()
        .describe("Include threads from SPAM and TRASH"),
    }),
    outputSchema: z.object({
      threads: z
        .array(
          z.object({
            id: z.string().describe("Thread ID"),
            snippet: z.string().optional().describe("Thread snippet"),
            historyId: z.string().optional().describe("History ID"),
          }),
        )
        .describe("List of threads"),
      nextPageToken: z.string().optional().describe("Token for next page"),
    }),
    execute: async ({ context }) => {
      const client = new GmailClient({
        accessToken: getAccessToken(env),
      });

      const result = await client.listThreads({
        maxResults: context.maxResults,
        pageToken: context.pageToken,
        q: context.q,
        labelIds: context.labelIds,
        includeSpamTrash: context.includeSpamTrash,
      });

      return {
        threads: result.threads,
        nextPageToken: result.nextPageToken,
      };
    },
  });

// ============================================================================
// Get Thread Tool
// ============================================================================

export const createGetThreadTool = (env: Env) =>
  createPrivateTool({
    id: "gmail_get_conversation",
    description:
      "Get a complete email conversation with all messages in the thread. Perfect for viewing entire email exchanges.",
    inputSchema: z.object({
      id: z.string().describe("Thread ID"),
      format: z
        .enum(["minimal", "full", "metadata"])
        .optional()
        .describe("Response format (default: full)"),
    }),
    outputSchema: z.object({
      thread: ThreadSchema.describe("Thread with all messages"),
    }),
    execute: async ({ context }) => {
      const client = new GmailClient({
        accessToken: getAccessToken(env),
      });

      const thread = await client.getThread({
        id: context.id,
        format: context.format || "full",
      });

      // Parse all messages in the thread
      const messages = thread.messages?.map((msg) => {
        const parsed = client.parseMessage(msg);
        return {
          id: parsed.id,
          threadId: parsed.threadId,
          labelIds: parsed.labelIds,
          snippet: parsed.snippet,
          from: parsed.from,
          to: parsed.to,
          subject: parsed.subject,
          date: parsed.date,
          bodyText: parsed.bodyText,
        };
      });

      return {
        thread: {
          id: thread.id,
          snippet: thread.snippet,
          historyId: thread.historyId,
          messages,
        },
      };
    },
  });

// ============================================================================
// Trash Thread Tool
// ============================================================================

export const createTrashThreadTool = (env: Env) =>
  createPrivateTool({
    id: "gmail_move_conversation_to_trash",
    description:
      "Move an entire email conversation (all messages in the thread) to trash.",
    inputSchema: z.object({
      id: z.string().describe("Thread ID to trash"),
    }),
    outputSchema: z.object({
      success: z.boolean().describe("Whether operation was successful"),
      message: z.string().describe("Result message"),
    }),
    execute: async ({ context }) => {
      const client = new GmailClient({
        accessToken: getAccessToken(env),
      });

      await client.trashThread(context.id);

      return {
        success: true,
        message: `Thread ${context.id} moved to trash`,
      };
    },
  });

// ============================================================================
// Untrash Thread Tool
// ============================================================================

export const createUntrashThreadTool = (env: Env) =>
  createPrivateTool({
    id: "gmail_restore_conversation_from_trash",
    description:
      "Restore an entire email conversation from trash back to inbox.",
    inputSchema: z.object({
      id: z.string().describe("Thread ID to restore"),
    }),
    outputSchema: z.object({
      success: z.boolean().describe("Whether operation was successful"),
      message: z.string().describe("Result message"),
    }),
    execute: async ({ context }) => {
      const client = new GmailClient({
        accessToken: getAccessToken(env),
      });

      await client.untrashThread(context.id);

      return {
        success: true,
        message: `Thread ${context.id} restored from trash`,
      };
    },
  });

// ============================================================================
// Modify Thread Tool
// ============================================================================

export const createModifyThreadTool = (env: Env) =>
  createPrivateTool({
    id: "gmail_update_conversation_labels",
    description:
      "Add or remove labels from an entire email conversation. Use to archive, mark as read/unread, star, or organize conversations.",
    inputSchema: z.object({
      id: z.string().describe("Thread ID"),
      addLabelIds: z
        .array(z.string())
        .optional()
        .describe("Labels to add to all messages in thread"),
      removeLabelIds: z
        .array(z.string())
        .optional()
        .describe(
          "Labels to remove from all messages (e.g., ['UNREAD'] to mark thread as read)",
        ),
    }),
    outputSchema: z.object({
      success: z.boolean().describe("Whether operation was successful"),
      message: z.string().describe("Result message"),
    }),
    execute: async ({ context }) => {
      const client = new GmailClient({
        accessToken: getAccessToken(env),
      });

      await client.modifyThread({
        id: context.id,
        addLabelIds: context.addLabelIds,
        removeLabelIds: context.removeLabelIds,
      });

      return {
        success: true,
        message: `Thread ${context.id} labels modified`,
      };
    },
  });

// ============================================================================
// Delete Thread Tool
// ============================================================================

export const createDeleteThreadTool = (env: Env) =>
  createPrivateTool({
    id: "gmail_permanently_delete_conversation",
    description:
      "PERMANENTLY delete an entire email conversation. WARNING: This cannot be undone! Use gmail_move_conversation_to_trash instead if you might need to recover later.",
    inputSchema: z.object({
      id: z.string().describe("Thread ID to permanently delete"),
    }),
    outputSchema: z.object({
      success: z.boolean().describe("Whether deletion was successful"),
      message: z.string().describe("Result message"),
    }),
    execute: async ({ context }) => {
      const client = new GmailClient({
        accessToken: getAccessToken(env),
      });

      await client.deleteThread(context.id);

      return {
        success: true,
        message: `Thread ${context.id} permanently deleted`,
      };
    },
  });

// ============================================================================
// Export all thread tools
// ============================================================================

export const threadTools = [
  createListThreadsTool,
  createGetThreadTool,
  createTrashThreadTool,
  createUntrashThreadTool,
  createModifyThreadTool,
  createDeleteThreadTool,
];
