/**
 * Slack Message Tools
 *
 * Tools for sending, editing, deleting, and searching messages.
 */

import { createTool } from "@decocms/runtime/tools";
import z from "zod";
import type { Env } from "../types/env.ts";
import {
  sendMessage,
  replyInThread,
  updateMessage,
  deleteMessage,
  getChannelHistory,
  getThreadReplies,
  searchMessages,
} from "../lib/slack-client.ts";

/**
 * Send a message to a channel
 */
export const createSendMessageTool = (_env: Env) =>
  createTool({
    id: "SLACK_SEND_MESSAGE",
    description:
      "Send a message to a Slack channel. Can optionally reply in a thread.",
    inputSchema: z
      .object({
        channel: z
          .string()
          .describe("Channel ID to send the message to (e.g., C1234567890)"),
        text: z.string().describe("The message text to send"),
        thread_ts: z
          .string()
          .optional()
          .describe("Thread timestamp to reply in (makes it a threaded reply)"),
        unfurl_links: z
          .boolean()
          .optional()
          .describe("Whether to unfurl links in the message"),
      })
      .strict(),
    outputSchema: z
      .object({
        success: z.boolean(),
        ts: z.string().optional().describe("Timestamp of the sent message"),
        channel: z.string().optional(),
        error: z.string().optional(),
      })
      .strict(),
    execute: async ({ context }: { context: unknown }) => {
      const input = context as {
        channel: string;
        text: string;
        thread_ts?: string;
        unfurl_links?: boolean;
      };

      try {
        const result = await sendMessage({
          channel: input.channel,
          text: input.text,
          threadTs: input.thread_ts,
          unfurlLinks: input.unfurl_links,
        });

        if (result) {
          return {
            success: true,
            ts: result.ts,
            channel: result.channel,
          };
        }

        return {
          success: false,
          error: "Failed to send message",
        };
      } catch (error) {
        return {
          success: false,
          error: error instanceof Error ? error.message : String(error),
        };
      }
    },
  });

/**
 * Reply in a thread
 */
export const createReplyInThreadTool = (_env: Env) =>
  createTool({
    id: "SLACK_REPLY_IN_THREAD",
    description: "Reply to a message in a thread",
    inputSchema: z
      .object({
        channel: z.string().describe("Channel ID where the thread exists"),
        thread_ts: z
          .string()
          .describe("Timestamp of the parent message (thread_ts)"),
        text: z.string().describe("The reply text"),
      })
      .strict(),
    outputSchema: z
      .object({
        success: z.boolean(),
        ts: z.string().optional().describe("Timestamp of the reply"),
        error: z.string().optional(),
      })
      .strict(),
    execute: async ({ context }: { context: unknown }) => {
      const input = context as {
        channel: string;
        thread_ts: string;
        text: string;
      };

      try {
        const result = await replyInThread(
          input.channel,
          input.thread_ts,
          input.text,
        );

        if (result) {
          return {
            success: true,
            ts: result.ts,
          };
        }

        return {
          success: false,
          error: "Failed to reply in thread",
        };
      } catch (error) {
        return {
          success: false,
          error: error instanceof Error ? error.message : String(error),
        };
      }
    },
  });

/**
 * Edit a message
 */
export const createEditMessageTool = (_env: Env) =>
  createTool({
    id: "SLACK_EDIT_MESSAGE",
    description: "Edit an existing message",
    inputSchema: z
      .object({
        channel: z.string().describe("Channel ID where the message exists"),
        ts: z.string().describe("Timestamp of the message to edit"),
        text: z.string().describe("The new message text"),
      })
      .strict(),
    outputSchema: z
      .object({
        success: z.boolean(),
        error: z.string().optional(),
      })
      .strict(),
    execute: async ({ context }: { context: unknown }) => {
      const input = context as {
        channel: string;
        ts: string;
        text: string;
      };

      try {
        const success = await updateMessage(
          input.channel,
          input.ts,
          input.text,
        );

        return {
          success,
          error: success ? undefined : "Failed to edit message",
        };
      } catch (error) {
        return {
          success: false,
          error: error instanceof Error ? error.message : String(error),
        };
      }
    },
  });

/**
 * Delete a message
 */
export const createDeleteMessageTool = (_env: Env) =>
  createTool({
    id: "SLACK_DELETE_MESSAGE",
    description: "Delete a message from a channel",
    inputSchema: z
      .object({
        channel: z.string().describe("Channel ID where the message exists"),
        ts: z.string().describe("Timestamp of the message to delete"),
      })
      .strict(),
    outputSchema: z
      .object({
        success: z.boolean(),
        error: z.string().optional(),
      })
      .strict(),
    execute: async ({ context }: { context: unknown }) => {
      const input = context as {
        channel: string;
        ts: string;
      };

      try {
        const success = await deleteMessage(input.channel, input.ts);

        return {
          success,
          error: success ? undefined : "Failed to delete message",
        };
      } catch (error) {
        return {
          success: false,
          error: error instanceof Error ? error.message : String(error),
        };
      }
    },
  });

/**
 * Get channel message history
 */
export const createGetChannelHistoryTool = (_env: Env) =>
  createTool({
    id: "SLACK_GET_CHANNEL_HISTORY",
    description: "Get message history from a channel",
    inputSchema: z
      .object({
        channel: z.string().describe("Channel ID to get history from"),
        limit: z
          .number()
          .optional()
          .default(50)
          .describe("Maximum number of messages to return (default: 50)"),
        oldest: z
          .string()
          .optional()
          .describe("Only messages after this timestamp"),
        latest: z
          .string()
          .optional()
          .describe("Only messages before this timestamp"),
      })
      .strict(),
    outputSchema: z
      .object({
        success: z.boolean(),
        messages: z.array(
          z.object({
            user: z.string().optional(),
            text: z.string(),
            ts: z.string(),
            thread_ts: z.string().optional(),
            reply_count: z.number().optional(),
          }),
        ),
        error: z.string().optional(),
      })
      .strict(),
    execute: async ({ context }: { context: unknown }) => {
      const input = context as {
        channel: string;
        limit?: number;
        oldest?: string;
        latest?: string;
      };

      try {
        const messages = await getChannelHistory(input.channel, {
          limit: input.limit,
          oldest: input.oldest,
          latest: input.latest,
        });

        return {
          success: true,
          messages: messages.map((m) => ({
            user: m.user,
            text: m.text,
            ts: m.ts,
            thread_ts: m.thread_ts,
            reply_count: m.reply_count,
          })),
        };
      } catch (error) {
        return {
          success: false,
          messages: [],
          error: error instanceof Error ? error.message : String(error),
        };
      }
    },
  });

/**
 * Get thread replies
 */
export const createGetThreadRepliesTool = (_env: Env) =>
  createTool({
    id: "SLACK_GET_THREAD_REPLIES",
    description: "Get all replies in a thread",
    inputSchema: z
      .object({
        channel: z.string().describe("Channel ID where the thread exists"),
        thread_ts: z.string().describe("Timestamp of the parent message"),
        limit: z
          .number()
          .optional()
          .default(50)
          .describe("Maximum number of replies to return"),
      })
      .strict(),
    outputSchema: z
      .object({
        success: z.boolean(),
        messages: z.array(
          z.object({
            user: z.string().optional(),
            text: z.string(),
            ts: z.string(),
          }),
        ),
        error: z.string().optional(),
      })
      .strict(),
    execute: async ({ context }: { context: unknown }) => {
      const input = context as {
        channel: string;
        thread_ts: string;
        limit?: number;
      };

      try {
        const messages = await getThreadReplies(
          input.channel,
          input.thread_ts,
          input.limit,
        );

        return {
          success: true,
          messages: messages.map((m) => ({
            user: m.user,
            text: m.text,
            ts: m.ts,
          })),
        };
      } catch (error) {
        return {
          success: false,
          messages: [],
          error: error instanceof Error ? error.message : String(error),
        };
      }
    },
  });

/**
 * Search messages
 */
export const createSearchMessagesTool = (_env: Env) =>
  createTool({
    id: "SLACK_SEARCH_MESSAGES",
    description:
      "Search for messages across the workspace. Requires search:read scope.",
    inputSchema: z
      .object({
        query: z.string().describe("Search query"),
        count: z
          .number()
          .optional()
          .default(20)
          .describe("Number of results to return"),
        sort: z
          .enum(["score", "timestamp"])
          .optional()
          .default("score")
          .describe("Sort order"),
      })
      .strict(),
    outputSchema: z
      .object({
        success: z.boolean(),
        messages: z.array(
          z.object({
            text: z.string(),
            ts: z.string(),
            user: z.string().optional(),
          }),
        ),
        error: z.string().optional(),
      })
      .strict(),
    execute: async ({ context }: { context: unknown }) => {
      const input = context as {
        query: string;
        count?: number;
        sort?: "score" | "timestamp";
      };

      try {
        const messages = await searchMessages(input.query, {
          count: input.count,
          sort: input.sort,
        });

        return {
          success: true,
          messages: messages.map((m) => ({
            text: m.text,
            ts: m.ts,
            user: m.user,
          })),
        };
      } catch (error) {
        return {
          success: false,
          messages: [],
          error: error instanceof Error ? error.message : String(error),
        };
      }
    },
  });

/**
 * Export all message tools
 */
export const messageTools = [
  createSendMessageTool,
  createReplyInThreadTool,
  createEditMessageTool,
  createDeleteMessageTool,
  createGetChannelHistoryTool,
  createGetThreadRepliesTool,
  createSearchMessagesTool,
];
