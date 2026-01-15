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
    id: "gmail_list_emails",
    description:
      "List emails from Gmail inbox with subject, sender, and recipient information. Perfect for checking recent emails or filtering by labels.",
    inputSchema: z.object({
      maxResults: z.coerce
        .number()
        .int()
        .min(1)
        .max(100)
        .optional()
        .describe("Maximum number of emails to return (default: 20, max: 100)"),
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
        .describe("Include emails from SPAM and TRASH"),
    }),
    outputSchema: z.object({
      emails: z
        .array(
          z.object({
            id: z.string().describe("Email ID (use this to get full details)"),
            threadId: z.string().describe("Conversation thread ID"),
            subject: z.string().describe("Email subject line"),
            from: z.string().describe("Sender email address and name"),
            to: z.string().describe("Recipient email address"),
            date: z.string().describe("Date the email was sent"),
            snippet: z.string().describe("Preview of the email content"),
            isUnread: z.boolean().describe("Whether the email is unread"),
          }),
        )
        .describe("List of emails with basic information"),
      nextPageToken: z
        .string()
        .optional()
        .describe("Token for fetching the next page"),
      totalEmails: z.number().describe("Number of emails returned"),
    }),
    execute: async ({ context }) => {
      const client = new GmailClient({
        accessToken: getAccessToken(env),
      });

      const result = await client.listMessages({
        maxResults: context.maxResults || 20,
        pageToken: context.pageToken,
        q: context.q,
        labelIds: context.labelIds,
        includeSpamTrash: context.includeSpamTrash,
      });

      // Fetch details for each message to get subject, from, to
      const messageRefs = result.messages || [];
      const emails = await Promise.all(
        messageRefs.map(async (m) => {
          const full = await client.getMessage({
            id: m.id,
            format: "metadata",
          });
          const parsed = client.parseMessage(full);
          return {
            id: parsed.id,
            threadId: parsed.threadId,
            subject: parsed.subject || "(No subject)",
            from: parsed.from || "Unknown sender",
            to: parsed.to || "",
            date: parsed.date || "",
            snippet: parsed.snippet || "",
            isUnread: parsed.labelIds?.includes("UNREAD") || false,
          };
        }),
      );

      return {
        emails,
        nextPageToken: result.nextPageToken,
        totalEmails: emails.length,
      };
    },
  });

// ============================================================================
// Get Message Tool
// ============================================================================

export const createGetMessageTool = (env: Env) =>
  createPrivateTool({
    id: "gmail_get_email_details",
    description:
      "Get the full content of a specific email including subject, body text, HTML, sender, recipients, and attachments. Use the email ID from gmail_list_emails.",
    inputSchema: z.object({
      id: z.string().describe("Email ID (from gmail_list_emails)"),
      format: z
        .enum(["minimal", "full", "raw", "metadata"])
        .optional()
        .describe(
          "Response format: minimal (IDs only), full (complete email with body), raw (RFC 2822), metadata (headers only)",
        ),
    }),
    outputSchema: z.object({
      email: ParsedMessageSchema.describe(
        "Full email details including body and attachments",
      ),
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

      return { email: message };
    },
  });

// ============================================================================
// Send Message Tool
// ============================================================================

export const createSendMessageTool = (env: Env) =>
  createPrivateTool({
    id: "gmail_send_email",
    description:
      "Send a new email from Gmail. Supports HTML content, CC, BCC, and replies to existing conversations.",
    inputSchema: z.object({
      to: z
        .string()
        .describe("Recipient email address (e.g., 'john@example.com')"),
      subject: z.string().describe("Email subject line"),
      body: z
        .string()
        .describe("Email body content (HTML is supported for rich formatting)"),
      cc: z
        .string()
        .optional()
        .describe("CC recipients (comma-separated emails)"),
      bcc: z
        .string()
        .optional()
        .describe("BCC recipients (comma-separated emails)"),
      replyTo: z.string().optional().describe("Reply-To email address"),
      threadId: z
        .string()
        .optional()
        .describe("Thread ID to reply to an existing conversation"),
      inReplyTo: z
        .string()
        .optional()
        .describe("Message-ID being replied to (for proper email threading)"),
    }),
    outputSchema: z.object({
      emailId: z.string().describe("ID of the sent email"),
      threadId: z.string().describe("Conversation thread ID"),
      success: z.boolean().describe("Whether the email was sent successfully"),
      message: z.string().describe("Confirmation message"),
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
        emailId: result.id,
        threadId: result.threadId,
        success: true,
        message: `Email sent successfully to ${context.to} with subject "${context.subject}"`,
      };
    },
  });

// ============================================================================
// Search Messages Tool
// ============================================================================

export const createSearchMessagesTool = (env: Env) =>
  createPrivateTool({
    id: "gmail_search_emails",
    description: `Search emails in Gmail using powerful query syntax. Returns full email details including subject, sender, body, and attachments.

Search Examples:
- "is:unread" - Unread emails
- "from:john@example.com" - From specific sender
- "to:me" - Sent to me
- "subject:meeting" - Subject contains 'meeting'
- "has:attachment" - Has attachments
- "after:2024/01/01" - After specific date
- "before:2024/12/31" - Before specific date
- "label:work" - Has label 'work'
- "is:starred" - Starred emails
- "in:inbox" - In inbox
- Combine queries: "from:john subject:meeting is:unread"`,
    inputSchema: z.object({
      query: z
        .string()
        .describe(
          "Gmail search query (e.g., 'is:unread from:boss@company.com')",
        ),
      maxResults: z.coerce
        .number()
        .int()
        .min(1)
        .max(100)
        .optional()
        .describe("Maximum results (default: 20, max: 100)"),
      pageToken: z.string().optional().describe("Token for pagination"),
    }),
    outputSchema: z.object({
      emails: z
        .array(ParsedMessageSchema)
        .describe("List of matching emails with full details"),
      nextPageToken: z.string().optional().describe("Token for next page"),
      totalResults: z.number().describe("Number of emails found"),
    }),
    execute: async ({ context }) => {
      const client = new GmailClient({
        accessToken: getAccessToken(env),
      });

      // First, list message IDs matching the query
      const listResult = await client.listMessages({
        q: context.query,
        maxResults: context.maxResults || 20,
        pageToken: context.pageToken,
      });

      // Then fetch full details for each message (handle empty results)
      const messageRefs = listResult.messages || [];
      const emails = await Promise.all(
        messageRefs.map(async (m) => {
          const full = await client.getMessage({ id: m.id, format: "full" });
          return client.parseMessage(full);
        }),
      );

      return {
        emails,
        nextPageToken: listResult.nextPageToken,
        totalResults: emails.length,
      };
    },
  });

// ============================================================================
// Trash Message Tool
// ============================================================================

export const createTrashMessageTool = (env: Env) =>
  createPrivateTool({
    id: "gmail_move_email_to_trash",
    description:
      "Move an email to the Gmail trash. The email can be recovered later from trash.",
    inputSchema: z.object({
      id: z.string().describe("Email ID to move to trash"),
    }),
    outputSchema: z.object({
      success: z.boolean().describe("Whether the email was moved to trash"),
      message: z.string().describe("Confirmation message"),
    }),
    execute: async ({ context }) => {
      const client = new GmailClient({
        accessToken: getAccessToken(env),
      });

      await client.trashMessage(context.id);

      return {
        success: true,
        message: `Email moved to trash successfully`,
      };
    },
  });

// ============================================================================
// Untrash Message Tool
// ============================================================================

export const createUntrashMessageTool = (env: Env) =>
  createPrivateTool({
    id: "gmail_restore_email_from_trash",
    description: "Restore an email from Gmail trash back to the inbox.",
    inputSchema: z.object({
      id: z.string().describe("Email ID to restore from trash"),
    }),
    outputSchema: z.object({
      success: z.boolean().describe("Whether the email was restored"),
      message: z.string().describe("Confirmation message"),
    }),
    execute: async ({ context }) => {
      const client = new GmailClient({
        accessToken: getAccessToken(env),
      });

      await client.untrashMessage(context.id);

      return {
        success: true,
        message: `Email restored from trash successfully`,
      };
    },
  });

// ============================================================================
// Delete Message Tool
// ============================================================================

export const createDeleteMessageTool = (env: Env) =>
  createPrivateTool({
    id: "gmail_permanently_delete_email",
    description:
      "PERMANENTLY delete an email from Gmail. WARNING: This cannot be undone! Use gmail_move_email_to_trash instead if you might need to recover the email later.",
    inputSchema: z.object({
      id: z.string().describe("Email ID to permanently delete"),
    }),
    outputSchema: z.object({
      success: z.boolean().describe("Whether the email was deleted"),
      message: z.string().describe("Confirmation message"),
    }),
    execute: async ({ context }) => {
      const client = new GmailClient({
        accessToken: getAccessToken(env),
      });

      await client.deleteMessage(context.id);

      return {
        success: true,
        message: `Email permanently deleted`,
      };
    },
  });

// ============================================================================
// Modify Message Labels Tool
// ============================================================================

export const createModifyMessageTool = (env: Env) =>
  createPrivateTool({
    id: "gmail_update_email_labels",
    description: `Add or remove labels from an email. Use this to:
- Mark as read: remove 'UNREAD' label
- Mark as unread: add 'UNREAD' label
- Star email: add 'STARRED' label
- Archive: remove 'INBOX' label
- Mark important: add 'IMPORTANT' label`,
    inputSchema: z.object({
      id: z.string().describe("Email ID to modify"),
      addLabelIds: z
        .array(z.string())
        .optional()
        .describe("Labels to add (e.g., ['STARRED', 'IMPORTANT', 'UNREAD'])"),
      removeLabelIds: z
        .array(z.string())
        .optional()
        .describe(
          "Labels to remove (e.g., ['UNREAD'] to mark as read, ['INBOX'] to archive)",
        ),
    }),
    outputSchema: z.object({
      success: z.boolean().describe("Whether the labels were updated"),
      currentLabels: z
        .array(z.string())
        .describe("Updated list of labels on the email"),
      message: z.string().describe("Confirmation message"),
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
        currentLabels: result.labelIds || [],
        message: `Email labels updated successfully`,
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
