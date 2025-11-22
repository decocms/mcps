/**
 * MCP tools for Discord channel operations
 *
 * This file implements tools for:
 * - Creating channels
 * - Listing guild channels
 */

import type { Env } from "../main.ts";
import { createDiscordClient } from "./utils/discord-client.ts";
import { createPrivateTool } from "@decocms/runtime/mastra";
import {
  createChannelInputSchema,
  createChannelOutputSchema,
  getGuildChannelsInputSchema,
  getGuildChannelsOutputSchema,
} from "../lib/types.ts";

/**
 * CREATE_CHANNEL - Create a new channel in a Discord guild
 */
export const createCreateChannelTool = (env: Env) =>
  createPrivateTool({
    id: "CREATE_CHANNEL",
    description:
      "Create a new channel in a Discord server (guild). Supports text channels, voice channels, categories, and announcement channels. You can configure permissions, position, and various channel settings.",
    inputSchema: createChannelInputSchema,
    outputSchema: createChannelOutputSchema,
    execute: async ({ context }) => {
      const {
        guildId,
        name,
        type = 0,
        topic,
        nsfw = false,
        parentId,
        position,
        bitrate,
        userLimit,
        rateLimitPerUser,
      } = context;
      const state = env.DECO_REQUEST_CONTEXT.state;

      if (!name || name.length < 2 || name.length > 100) {
        throw new Error("Channel name must be between 2 and 100 characters");
      }

      const client = createDiscordClient({ botToken: state.botToken });

      const body: any = {
        name,
        type,
        nsfw,
      };

      if (topic) {
        if (topic.length > 1024) {
          throw new Error("Channel topic cannot exceed 1024 characters");
        }
        body.topic = topic;
      }

      if (parentId) body.parent_id = parentId;
      if (position !== undefined) body.position = position;
      if (bitrate !== undefined) body.bitrate = bitrate;
      if (userLimit !== undefined) body.user_limit = userLimit;
      if (rateLimitPerUser !== undefined)
        body.rate_limit_per_user = rateLimitPerUser;

      try {
        const channel = await client.createChannel(guildId, body);
        return {
          id: channel.id,
          type: channel.type,
          name: channel.name,
          guild_id: channel.guild_id,
        };
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        throw new Error(`Failed to create channel: ${message}`);
      }
    },
  });

/**
 * GET_GUILD_CHANNELS - Get all channels in a Discord guild
 */
export const createGetGuildChannelsTool = (env: Env) =>
  createPrivateTool({
    id: "GET_GUILD_CHANNELS",
    description:
      "Fetch all channels from a Discord server (guild). Returns a list of all channels including text, voice, categories, and announcement channels with their metadata.",
    inputSchema: getGuildChannelsInputSchema,
    outputSchema: getGuildChannelsOutputSchema,
    execute: async ({ context }) => {
      const { guildId } = context;
      const state = env.DECO_REQUEST_CONTEXT.state;

      const client = createDiscordClient({ botToken: state.botToken });

      try {
        const channels = await client.getGuildChannels(guildId);
        return {
          channels: channels.map((channel: any) => ({
            id: channel.id,
            type: channel.type,
            name: channel.name,
            guild_id: channel.guild_id,
          })),
        };
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        throw new Error(`Failed to get guild channels: ${message}`);
      }
    },
  });

/**
 * Array of all channel-related tools
 */
export const channelTools = [
  createCreateChannelTool,
  createGetGuildChannelsTool,
];
