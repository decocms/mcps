/**
 * Slack Channel Tools
 *
 * Tools for listing, getting info, and managing channels.
 */

import { createTool } from "@decocms/runtime/tools";
import z from "zod";
import type { Env } from "../types/env.ts";
import {
  listChannels,
  getChannelInfo,
  joinChannel,
  getChannelMembers,
  openDM,
  inviteToChannel,
} from "../lib/slack-client.ts";

/**
 * List all channels
 */
export const createListChannelsTool = (_env: Env) =>
  createTool({
    id: "SLACK_LIST_CHANNELS",
    description: "List all channels the bot has access to in the workspace",
    inputSchema: z
      .object({
        exclude_archived: z
          .boolean()
          .optional()
          .default(true)
          .describe("Exclude archived channels"),
        types: z
          .string()
          .optional()
          .default("public_channel,private_channel")
          .describe("Channel types to include (comma-separated)"),
        limit: z
          .number()
          .optional()
          .default(100)
          .describe("Maximum number of channels to return"),
      })
      .strict(),
    outputSchema: z
      .object({
        success: z.boolean(),
        channels: z.array(
          z.object({
            id: z.string(),
            name: z.string(),
            is_private: z.boolean(),
            is_archived: z.boolean(),
            is_member: z.boolean(),
            num_members: z.number().optional(),
            topic: z.string().optional(),
            purpose: z.string().optional(),
          }),
        ),
        error: z.string().optional(),
      })
      .strict(),
    execute: async ({ context }: { context: unknown }) => {
      const input = context as {
        exclude_archived?: boolean;
        types?: string;
        limit?: number;
      };

      try {
        const channels = await listChannels({
          excludeArchived: input.exclude_archived,
          types: input.types,
          limit: input.limit,
        });

        return {
          success: true,
          channels: channels.map((c) => ({
            id: c.id,
            name: c.name,
            is_private: c.is_private,
            is_archived: c.is_archived,
            is_member: c.is_member,
            num_members: c.num_members,
            topic: c.topic?.value,
            purpose: c.purpose?.value,
          })),
        };
      } catch (error) {
        return {
          success: false,
          channels: [],
          error: error instanceof Error ? error.message : String(error),
        };
      }
    },
  });

/**
 * Get channel info
 */
export const createGetChannelInfoTool = (_env: Env) =>
  createTool({
    id: "SLACK_GET_CHANNEL_INFO",
    description: "Get detailed information about a specific channel",
    inputSchema: z
      .object({
        channel: z.string().describe("Channel ID to get info for"),
      })
      .strict(),
    outputSchema: z
      .object({
        success: z.boolean(),
        channel: z
          .object({
            id: z.string(),
            name: z.string(),
            is_private: z.boolean(),
            is_archived: z.boolean(),
            is_member: z.boolean(),
            created: z.number(),
            creator: z.string(),
            num_members: z.number().optional(),
            topic: z.string().optional(),
            purpose: z.string().optional(),
          })
          .optional(),
        error: z.string().optional(),
      })
      .strict(),
    execute: async ({ context }: { context: unknown }) => {
      const input = context as {
        channel: string;
      };

      try {
        const info = await getChannelInfo(input.channel);

        if (!info) {
          return {
            success: false,
            error: "Channel not found",
          };
        }

        return {
          success: true,
          channel: {
            id: info.id,
            name: info.name,
            is_private: info.is_private,
            is_archived: info.is_archived,
            is_member: info.is_member,
            created: info.created,
            creator: info.creator,
            num_members: info.num_members,
            topic: info.topic?.value,
            purpose: info.purpose?.value,
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
 * Join a channel
 */
export const createJoinChannelTool = (_env: Env) =>
  createTool({
    id: "SLACK_JOIN_CHANNEL",
    description: "Join a public channel",
    inputSchema: z
      .object({
        channel: z.string().describe("Channel ID to join"),
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
      };

      try {
        const success = await joinChannel(input.channel);

        return {
          success,
          error: success ? undefined : "Failed to join channel",
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
 * Get channel members
 */
export const createGetChannelMembersTool = (_env: Env) =>
  createTool({
    id: "SLACK_GET_CHANNEL_MEMBERS",
    description: "Get the list of member user IDs in a channel",
    inputSchema: z
      .object({
        channel: z.string().describe("Channel ID to get members from"),
        limit: z
          .number()
          .optional()
          .default(100)
          .describe("Maximum number of members to return"),
      })
      .strict(),
    outputSchema: z
      .object({
        success: z.boolean(),
        members: z.array(z.string()).describe("Array of user IDs"),
        error: z.string().optional(),
      })
      .strict(),
    execute: async ({ context }: { context: unknown }) => {
      const input = context as {
        channel: string;
        limit?: number;
      };

      try {
        const members = await getChannelMembers(input.channel, input.limit);

        return {
          success: true,
          members,
        };
      } catch (error) {
        return {
          success: false,
          members: [],
          error: error instanceof Error ? error.message : String(error),
        };
      }
    },
  });

/**
 * Open a direct message conversation with a user
 */
export const createOpenDMTool = (_env: Env) =>
  createTool({
    id: "SLACK_OPEN_DM",
    description:
      "Open a direct message conversation with a user. Returns the channel ID for the DM.",
    inputSchema: z
      .object({
        user_id: z
          .string()
          .describe("User ID to open a DM with (e.g., U1234567890)"),
      })
      .strict(),
    outputSchema: z
      .object({
        success: z.boolean(),
        channel_id: z.string().optional().describe("Channel ID of the DM"),
        error: z.string().optional(),
      })
      .strict(),
    execute: async ({ context }: { context: unknown }) => {
      const input = context as {
        user_id: string;
      };

      try {
        const result = await openDM(input.user_id);

        if (result.ok) {
          return {
            success: true,
            channel_id: result.channelId,
          };
        }

        return {
          success: false,
          error: result.error ?? "Failed to open DM",
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
 * Invite a user to a channel
 */
export const createInviteToChannelTool = (_env: Env) =>
  createTool({
    id: "SLACK_INVITE_TO_CHANNEL",
    description: "Invite a user to a public channel",
    inputSchema: z
      .object({
        channel: z.string().describe("Channel ID to invite the user to"),
        user_id: z.string().describe("User ID to invite"),
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
        user_id: string;
      };

      try {
        const success = await inviteToChannel(input.channel, input.user_id);

        return {
          success,
          error: success ? undefined : "Failed to invite user to channel",
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
 * Export all channel tools
 */
export const channelTools = [
  createListChannelsTool,
  createGetChannelInfoTool,
  createJoinChannelTool,
  createGetChannelMembersTool,
  createOpenDMTool,
  createInviteToChannelTool,
];
