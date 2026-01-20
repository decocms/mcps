/**
 * Setup Tools
 *
 * Tools for bot status and thread management.
 */

import { createPrivateTool } from "@decocms/runtime/tools";
import z from "zod";
import type { Env } from "../types/env.ts";
import {
  getSlackClient,
  getBotInfo,
  ensureSlackClient,
} from "../lib/slack-client.ts";
import {
  getThreadMetadata,
  resetThread,
  getRecentMessages,
} from "../lib/thread.ts";

/**
 * Get bot status
 */
export const createGetBotStatusTool = (env: Env) =>
  createPrivateTool({
    id: "SLACK_GET_BOT_STATUS",
    description: "Get the current status of the Slack bot",
    inputSchema: z.object({}).strict(),
    outputSchema: z
      .object({
        success: z.boolean(),
        status: z.object({
          connected: z.boolean(),
          bot_user_id: z.string().optional(),
          bot_id: z.string().optional(),
          team_id: z.string().optional(),
          configured: z.boolean(),
        }),
        error: z.string().optional(),
      })
      .strict(),
    execute: async () => {
      try {
        const botToken = env.MESH_REQUEST_CONTEXT?.state?.BOT_TOKEN;

        // Try to ensure client is initialized
        const client = ensureSlackClient(botToken);

        if (!client) {
          return {
            success: true,
            status: {
              connected: false,
              configured: !!botToken,
            },
          };
        }

        const botInfo = await getBotInfo();

        return {
          success: true,
          status: {
            connected: true,
            bot_user_id: botInfo?.userId,
            bot_id: botInfo?.botId,
            team_id: botInfo?.teamId,
            configured: true,
          },
        };
      } catch (error) {
        return {
          success: false,
          status: {
            connected: false,
            configured: false,
          },
          error: error instanceof Error ? error.message : String(error),
        };
      }
    },
  });

/**
 * Get thread info
 */
export const createGetThreadInfoTool = (_env: Env) =>
  createPrivateTool({
    id: "SLACK_GET_THREAD_INFO",
    description:
      "Get information about a logical conversation thread (used for context management)",
    inputSchema: z
      .object({
        channel: z.string().describe("Channel ID"),
        thread_identifier: z
          .string()
          .describe("Thread identifier (message ts or thread_ts)"),
      })
      .strict(),
    outputSchema: z
      .object({
        success: z.boolean(),
        thread: z
          .object({
            thread_id: z.string(),
            message_count: z.number(),
            last_activity: z.number(),
            is_active: z.boolean(),
          })
          .optional(),
        error: z.string().optional(),
      })
      .strict(),
    execute: async ({ context }: { context: unknown }) => {
      const input = context as {
        channel: string;
        thread_identifier: string;
      };

      try {
        const metadata = await getThreadMetadata(
          input.channel,
          input.thread_identifier,
        );

        if (!metadata) {
          return {
            success: true,
            thread: undefined,
          };
        }

        return {
          success: true,
          thread: {
            thread_id: metadata.threadId,
            message_count: metadata.messageCount,
            last_activity: metadata.lastActivity,
            is_active: metadata.isActive,
          },
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
 * Reset thread context
 */
export const createResetThreadTool = (_env: Env) =>
  createPrivateTool({
    id: "SLACK_RESET_THREAD",
    description:
      "Reset a conversation thread context (clears message history for the thread)",
    inputSchema: z
      .object({
        channel: z.string().describe("Channel ID"),
        thread_identifier: z.string().describe("Thread identifier to reset"),
      })
      .strict(),
    outputSchema: z
      .object({
        success: z.boolean(),
        message: z.string().optional(),
        error: z.string().optional(),
      })
      .strict(),
    execute: async ({ context }: { context: unknown }) => {
      const input = context as {
        channel: string;
        thread_identifier: string;
      };

      try {
        await resetThread(input.channel, input.thread_identifier);

        return {
          success: true,
          message: `Thread ${input.channel}:${input.thread_identifier} has been reset`,
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
 * Get thread conversation history
 */
export const createGetThreadHistoryTool = (_env: Env) =>
  createPrivateTool({
    id: "SLACK_GET_THREAD_HISTORY",
    description:
      "Get the conversation history for a logical thread (internal context, not Slack messages)",
    inputSchema: z
      .object({
        channel: z.string().describe("Channel ID"),
        thread_identifier: z.string().describe("Thread identifier"),
        count: z
          .number()
          .optional()
          .default(10)
          .describe("Number of recent messages to return"),
      })
      .strict(),
    outputSchema: z
      .object({
        success: z.boolean(),
        messages: z.array(
          z.object({
            role: z.enum(["user", "assistant", "system"]),
            content: z.string(),
            timestamp: z.number(),
            user_id: z.string().optional(),
          }),
        ),
        error: z.string().optional(),
      })
      .strict(),
    execute: async ({ context }: { context: unknown }) => {
      const input = context as {
        channel: string;
        thread_identifier: string;
        count?: number;
      };

      try {
        const messages = await getRecentMessages(
          input.channel,
          input.thread_identifier,
          input.count,
        );

        return {
          success: true,
          messages: messages.map((m) => ({
            role: m.role,
            content: m.content,
            timestamp: m.timestamp,
            user_id: m.userId,
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
 * Export all setup tools
 */
export const setupTools = [
  createGetBotStatusTool,
  createGetThreadInfoTool,
  createResetThreadTool,
  createGetThreadHistoryTool,
];
