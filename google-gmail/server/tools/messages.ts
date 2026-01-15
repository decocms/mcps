/**
 * Message Management Tools
 *
 * Tools for listing, getting, sending, searching, and managing messages
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
  labelIds: z.array(z.string()).describe("Label IDs applied to this message"),
  snippet: z.string().describe("Short snippet of the message content"),
  from: z.string().optional().describe("Sender email address"),
  to: z.string().optional().describe("Recipient email address"),
  cc: z.string().optional().describe("CC recipients"),
  bcc: z.string().optional().describe("BCC recipients"),
  subject: z.string().optional().describe("Email subject"),
  date: z.string().optional().describe("Date the email was sent"),
  bodyText: z.string().optional().describe("Plain text body"),
  bodyHtml: z.string().optional().describe("HTML body"),
  attachments: z
    .array(
      z.object({
        filename: z.string(),
        mimeType: z.string(),
        size: z.number(),
        attachmentId: z.string().optional(),
      }),
    )
    .optional()
    .describe("List of attachments"),
});

// ============================================================================
// List Messages Tool
// ============================================================================

export const createListMessagesTool = (env: Env) =>
  createPrivateTool({
    id: "list_messages",
    description:
      "List messages in the mailbox. Returns message IDs and thread IDs. Use get_message to fetch full details.",
    inputSchema: z.object({
      maxResults: z.coerce
        .number()
        .int()
        .min(1)
        .max(500)
        .optional()
        .describe("Maximum number of messages to return (default: 50)"),
      pageToken: z.string().optional().describe("Token for pagination"),
      q: z
        .string()
        .optional()
        .describe(
          "Gmail search query (e.g., 'is:unread', 'from:john@example.com', 'subject:meeting')",
        ),
      labelIds: z
        .array(z.string())
        .optional()
        .describe("Filter by label IDs (e.g., ['INBOX', 'UNREAD'])"),
      includeSpamTrash: z
        .boolean()
        .optional()
        .describe("Include messages from SPAM and TRASH"),
    }),
    outputSchema: z.object({
      messages: z
        .array(
          z.object({
            id: z.string().describe("Message ID"),
            threadId: z.string().describe("Thread ID"),
          }),
        )
        .describe("List of message references"),
      nextPageToken: z
        .string()
        .optional()
        .describe("Token for fetching the next page"),
    }),
    execute: async ({ context }) => {
      const client = new GmailClient({
        accessToken: getAccessToken(env),
      });

      const result = await client.listMessages({
        maxResults: context.maxResults,
        pageToken: context.pageToken,
        q: context.q,
        labelIds: context.labelIds,
        includeSpamTrash: context.includeSpamTrash,
      });

      return {
        messages: result.messages,
        nextPageToken: result.nextPageToken,
      };
    },
  });

// ============================================================================
// Get Message Tool
// ============================================================================

export const createGetMessageTool = (env: Env) =>
  createPrivateTool({
    id: "get_message",
    description:
      "Get full details of a specific message including headers, body, and attachments.",
    inputSchema: z.object({
      id: z.string().describe("Message ID"),
      format: z
        .enum(["minimal", "full", "raw", "metadata"])
        .optional()
        .describe(
          "Response format: minimal (IDs only), full (parsed), raw (RFC 2822), metadata (headers only)",
        ),
    }),
    outputSchema: z.object({
      message: ParsedMessageSchema.describe("Parsed message details"),
    }),
    execute: async ({ context }) => {
      const client = new GmailClient({
        accessToken: getAccessToken(env),
      });

      const rawMessage = await client.getMessage({
        id: context.id,
        format: context.format || "full",
      });

      const message = client.parseMessage(rawMessage);

      return { message };
    },
  });

// ============================================================================
// Send Message Tool
// ============================================================================

export const createSendMessageTool = (env: Env) =>
  createPrivateTool({
    id: "send_message",
    description: "Send a new email message.",
    inputSchema: z.object({
      to: z.string().describe("Recipient email address (required)"),
      subject: z.string().describe("Email subject (required)"),
      body: z
        .string()
        .describe("Email body content (HTML supported, required)"),
      cc: z.string().optional().describe("CC recipients (comma-separated)"),
      bcc: z.string().optional().describe("BCC recipients (comma-separated)"),
      replyTo: z.string().optional().describe("Reply-To email address"),
      threadId: z
        .string()
        .optional()
        .describe("Thread ID to add this message to (for replies)"),
      inReplyTo: z
        .string()
        .optional()
        .describe("Message-ID being replied to (for threading)"),
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

      const result = await client.sendMessage({
        to: context.to,
        subject: context.subject,
        body: context.body,
        cc: context.cc,
        bcc: context.bcc,
        replyTo: context.replyTo,
        threadId: context.threadId,
        inReplyTo: context.inReplyTo,
      });

      return {
        messageId: result.id,
        threadId: result.threadId,
        success: true,
      };
    },
  });

// ============================================================================
// Search Messages Tool
// ============================================================================

export const createSearchMessagesTool = (env: Env) =>
  createPrivateTool({
    id: "search_messages",
    description: `Search messages using Gmail's powerful query syntax.

Examples:
- "is:unread" - Unread messages
- "from:john@example.com" - From specific sender
- "to:me" - Sent to me
- "subject:meeting" - Subject contains 'meeting'
- "has:attachment" - Has attachments
- "after:2024/01/01" - After date
- "before:2024/12/31" - Before date
- "label:work" - Has label 'work'
- "is:starred" - Starred messages
- "in:inbox" - In inbox
- Combine with AND/OR: "from:john subject:meeting"`,
    inputSchema: z.object({
      query: z.string().describe("Gmail search query (required)"),
      maxResults: z.coerce
        .number()
        .int()
        .min(1)
        .max(500)
        .optional()
        .describe("Maximum results (default: 50)"),
      pageToken: z.string().optional().describe("Token for pagination"),
    }),
    outputSchema: z.object({
      messages: z
        .array(ParsedMessageSchema)
        .describe("List of matching messages with full details"),
      nextPageToken: z.string().optional().describe("Token for next page"),
      totalResults: z.number().describe("Number of results returned"),
    }),
    execute: async ({ context }) => {
      const client = new GmailClient({
        accessToken: getAccessToken(env),
      });

      // First, list message IDs matching the query
      const listResult = await client.listMessages({
        q: context.query,
        maxResults: context.maxResults || 50,
        pageToken: context.pageToken,
      });

      // Then fetch full details for each message (handle empty results)
      const messageRefs = listResult.messages || [];
      const messages = await Promise.all(
        messageRefs.map(async (m) => {
          const full = await client.getMessage({ id: m.id, format: "full" });
          return client.parseMessage(full);
        }),
      );

      return {
        messages,
        nextPageToken: listResult.nextPageToken,
        totalResults: messages.length,
      };
    },
  });

// ============================================================================
// Trash Message Tool
// ============================================================================

export const createTrashMessageTool = (env: Env) =>
  createPrivateTool({
    id: "trash_message",
    description: "Move a message to the trash. Can be recovered later.",
    inputSchema: z.object({
      id: z.string().describe("Message ID to trash"),
    }),
    outputSchema: z.object({
      success: z.boolean().describe("Whether operation was successful"),
      message: z.string().describe("Result message"),
    }),
    execute: async ({ context }) => {
      const client = new GmailClient({
        accessToken: getAccessToken(env),
      });

      await client.trashMessage(context.id);

      return {
        success: true,
        message: `Message ${context.id} moved to trash`,
      };
    },
  });

// ============================================================================
// Untrash Message Tool
// ============================================================================

export const createUntrashMessageTool = (env: Env) =>
  createPrivateTool({
    id: "untrash_message",
    description: "Remove a message from trash and restore it.",
    inputSchema: z.object({
      id: z.string().describe("Message ID to restore from trash"),
    }),
    outputSchema: z.object({
      success: z.boolean().describe("Whether operation was successful"),
      message: z.string().describe("Result message"),
    }),
    execute: async ({ context }) => {
      const client = new GmailClient({
        accessToken: getAccessToken(env),
      });

      await client.untrashMessage(context.id);

      return {
        success: true,
        message: `Message ${context.id} restored from trash`,
      };
    },
  });

// ============================================================================
// Delete Message Tool
// ============================================================================

export const createDeleteMessageTool = (env: Env) =>
  createPrivateTool({
    id: "delete_message",
    description:
      "Permanently delete a message. This cannot be undone! Use trash_message instead if you want to recover later.",
    inputSchema: z.object({
      id: z.string().describe("Message ID to permanently delete"),
    }),
    outputSchema: z.object({
      success: z.boolean().describe("Whether deletion was successful"),
      message: z.string().describe("Result message"),
    }),
    execute: async ({ context }) => {
      const client = new GmailClient({
        accessToken: getAccessToken(env),
      });

      await client.deleteMessage(context.id);

      return {
        success: true,
        message: `Message ${context.id} permanently deleted`,
      };
    },
  });

// ============================================================================
// Modify Message Labels Tool
// ============================================================================

export const createModifyMessageTool = (env: Env) =>
  createPrivateTool({
    id: "modify_message",
    description:
      "Add or remove labels from a message. Use this to mark as read/unread, star, archive, etc.",
    inputSchema: z.object({
      id: z.string().describe("Message ID"),
      addLabelIds: z
        .array(z.string())
        .optional()
        .describe(
          "Labels to add (e.g., ['STARRED', 'IMPORTANT'] or custom label IDs)",
        ),
      removeLabelIds: z
        .array(z.string())
        .optional()
        .describe(
          "Labels to remove (e.g., ['UNREAD'] to mark as read, ['INBOX'] to archive)",
        ),
    }),
    outputSchema: z.object({
      success: z.boolean().describe("Whether operation was successful"),
      labelIds: z.array(z.string()).describe("Updated list of labels"),
    }),
    execute: async ({ context }) => {
      const client = new GmailClient({
        accessToken: getAccessToken(env),
      });

      const result = await client.modifyMessage({
        id: context.id,
        addLabelIds: context.addLabelIds,
        removeLabelIds: context.removeLabelIds,
      });

      return {
        success: true,
        labelIds: result.labelIds || [],
      };
    },
  });

// ============================================================================
// Export all message tools
// ============================================================================

export const messageTools = [
  createListMessagesTool,
  createGetMessageTool,
  createSendMessageTool,
  createSearchMessagesTool,
  createTrashMessageTool,
  createUntrashMessageTool,
  createDeleteMessageTool,
  createModifyMessageTool,
];
