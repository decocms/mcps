/**
 * Slack User and Reaction Tools
 *
 * Tools for getting user info and managing reactions.
 */

import { createTool } from "@decocms/runtime/tools";
import z from "zod";
import type { Env } from "../types/env.ts";
import {
  getUserInfo,
  listUsers,
  addReaction,
  removeReaction,
  getBotInfo,
} from "../lib/slack-client.ts";

/**
 * Get user info
 */
export const createGetUserInfoTool = (_env: Env) =>
  createTool({
    id: "SLACK_GET_USER_INFO",
    description: "Get detailed information about a Slack user",
    inputSchema: z
      .object({
        user_id: z.string().describe("User ID to get info for"),
      })
      .strict(),
    outputSchema: z
      .object({
        success: z.boolean(),
        user: z
          .object({
            id: z.string(),
            name: z.string(),
            real_name: z.string().optional(),
            display_name: z.string().optional(),
            email: z.string().optional(),
            is_admin: z.boolean(),
            is_owner: z.boolean(),
            is_bot: z.boolean(),
            tz: z.string().optional(),
            avatar_url: z.string().optional(),
          })
          .optional(),
        error: z.string().optional(),
      })
      .strict(),
    execute: async ({ context }: { context: unknown }) => {
      const input = context as {
        user_id: string;
      };

      try {
        const user = await getUserInfo(input.user_id);

        if (!user) {
          return {
            success: false,
            error: "User not found",
          };
        }

        return {
          success: true,
          user: {
            id: user.id,
            name: user.name,
            real_name: user.real_name,
            display_name: user.profile?.display_name,
            email: user.profile?.email,
            is_admin: user.is_admin,
            is_owner: user.is_owner,
            is_bot: user.is_bot,
            tz: user.tz,
            avatar_url: user.profile?.image_72,
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
 * List all users
 */
export const createListUsersTool = (_env: Env) =>
  createTool({
    id: "SLACK_LIST_USERS",
    description: "List all users in the workspace",
    inputSchema: z
      .object({
        limit: z
          .number()
          .optional()
          .default(100)
          .describe("Maximum number of users to return"),
      })
      .strict(),
    outputSchema: z
      .object({
        success: z.boolean(),
        users: z.array(
          z.object({
            id: z.string(),
            name: z.string(),
            real_name: z.string().optional(),
            is_bot: z.boolean(),
            deleted: z.boolean(),
          }),
        ),
        error: z.string().optional(),
      })
      .strict(),
    execute: async ({ context }: { context: unknown }) => {
      const input = context as {
        limit?: number;
      };

      try {
        const users = await listUsers(input.limit);

        return {
          success: true,
          users: users.map((u) => ({
            id: u.id,
            name: u.name,
            real_name: u.real_name,
            is_bot: u.is_bot,
            deleted: u.deleted,
          })),
        };
      } catch (error) {
        return {
          success: false,
          users: [],
          error: error instanceof Error ? error.message : String(error),
        };
      }
    },
  });

/**
 * Get bot info
 */
export const createGetBotInfoTool = (_env: Env) =>
  createTool({
    id: "SLACK_GET_BOT_INFO",
    description: "Get information about the current bot",
    inputSchema: z.object({}).strict(),
    outputSchema: z
      .object({
        success: z.boolean(),
        bot: z
          .object({
            user_id: z.string(),
            bot_id: z.string(),
            team_id: z.string(),
          })
          .optional(),
        error: z.string().optional(),
      })
      .strict(),
    execute: async () => {
      try {
        const info = await getBotInfo();

        if (!info) {
          return {
            success: false,
            error: "Failed to get bot info",
          };
        }

        return {
          success: true,
          bot: {
            user_id: info.userId,
            bot_id: info.botId,
            team_id: info.teamId,
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
 * Add reaction to a message
 */
export const createAddReactionTool = (_env: Env) =>
  createTool({
    id: "SLACK_ADD_REACTION",
    description: "Add an emoji reaction to a message",
    inputSchema: z
      .object({
        channel: z.string().describe("Channel ID where the message exists"),
        timestamp: z.string().describe("Timestamp of the message to react to"),
        emoji: z
          .string()
          .describe(
            "Emoji name without colons (e.g., 'thumbsup' not ':thumbsup:')",
          ),
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
        timestamp: string;
        emoji: string;
      };

      try {
        const success = await addReaction(
          input.channel,
          input.timestamp,
          input.emoji,
        );

        return {
          success,
          error: success ? undefined : "Failed to add reaction",
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
 * Remove reaction from a message
 */
export const createRemoveReactionTool = (_env: Env) =>
  createTool({
    id: "SLACK_REMOVE_REACTION",
    description: "Remove an emoji reaction from a message",
    inputSchema: z
      .object({
        channel: z.string().describe("Channel ID where the message exists"),
        timestamp: z.string().describe("Timestamp of the message"),
        emoji: z.string().describe("Emoji name to remove"),
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
        timestamp: string;
        emoji: string;
      };

      try {
        const success = await removeReaction(
          input.channel,
          input.timestamp,
          input.emoji,
        );

        return {
          success,
          error: success ? undefined : "Failed to remove reaction",
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
 * Export all user and reaction tools
 */
export const userTools = [
  createGetUserInfoTool,
  createListUsersTool,
  createGetBotInfoTool,
  createAddReactionTool,
  createRemoveReactionTool,
];
