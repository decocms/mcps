import type { Env } from "../main.ts";
import { createDiscordClient } from "./utils/discord-client.ts";
import { createPrivateTool } from "@decocms/runtime/mastra";
import {
  listBotGuildsInputSchema,
  listBotGuildsOutputSchema,
  getGuildInputSchema,
  getGuildOutputSchema,
  getGuildMembersInputSchema,
  getGuildMembersOutputSchema,
  banMemberInputSchema,
  banMemberOutputSchema,
  getCurrentUserInputSchema,
  getCurrentUserOutputSchema,
  getUserInputSchema,
  getUserOutputSchema,
} from "../lib/types.ts";

/**
 * LIST_BOT_GUILDS - List all guilds where the bot is present
 */
export const createListBotGuildsTool = (env: Env) =>
  createPrivateTool({
    id: "LIST_BOT_GUILDS",
    description:
      "List all Discord servers (guilds) where the bot is currently a member. Returns guild names, IDs, icons, and permissions. Supports pagination.",
    inputSchema: listBotGuildsInputSchema,
    outputSchema: listBotGuildsOutputSchema,
    execute: async ({ context }) => {
      const { limit = 100, before, after, withCounts = false } = context;
      const state = env.DECO_REQUEST_CONTEXT.state;

      const client = createDiscordClient({ botToken: state.botToken });

      const searchParams: Record<string, string> = {
        limit: Math.min(Math.max(limit, 1), 200).toString(),
      };

      if (before) searchParams.before = before;
      if (after) searchParams.after = after;
      if (withCounts) searchParams.with_counts = "true";

      try {
        const guilds = await client.listBotGuilds(searchParams);
        return {
          guilds: guilds.map((guild: any) => ({
            id: guild.id,
            name: guild.name,
            icon: guild.icon,
            owner: guild.owner,
            permissions: guild.permissions,
          })),
        };
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        throw new Error(`Failed to list bot guilds: ${message}`);
      }
    },
  });

/**
 * GET_GUILD - Get information about a specific guild
 */
export const createGetGuildTool = (env: Env) =>
  createPrivateTool({
    id: "GET_GUILD",
    description:
      "Fetch detailed information about a specific Discord server (guild) including name, icon, owner, and member counts. Requires the bot to be a member of the guild.",
    inputSchema: getGuildInputSchema,
    outputSchema: getGuildOutputSchema,
    execute: async ({ context }) => {
      const { guildId, withCounts = false } = context;
      const state = env.DECO_REQUEST_CONTEXT.state;

      const client = createDiscordClient({ botToken: state.botToken });

      const searchParams: Record<string, string> = {};
      if (withCounts) searchParams.with_counts = "true";

      try {
        const guild = await client.getGuild(guildId, searchParams);
        return {
          id: guild.id,
          name: guild.name,
          icon: guild.icon,
          owner_id: guild.owner_id,
          permissions: guild.permissions,
          member_count: guild.approximate_member_count,
        };
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        throw new Error(`Failed to get guild: ${message}`);
      }
    },
  });

/**
 * GET_GUILD_MEMBERS - Get members from a guild
 */
export const createGetGuildMembersTool = (env: Env) =>
  createPrivateTool({
    id: "GET_GUILD_MEMBERS",
    description:
      "Fetch members from a Discord server (guild). Returns user information, nicknames, roles, and join dates. Supports pagination with up to 1000 members per request. Requires the GUILD_MEMBERS privileged intent.",
    inputSchema: getGuildMembersInputSchema,
    outputSchema: getGuildMembersOutputSchema,
    execute: async ({ context }) => {
      const { guildId, limit = 100, after } = context;
      const state = env.DECO_REQUEST_CONTEXT.state;

      const client = createDiscordClient({ botToken: state.botToken });

      const searchParams: Record<string, string> = {
        limit: Math.min(Math.max(limit, 1), 1000).toString(),
      };

      if (after) searchParams.after = after;

      try {
        const members = await client.getGuildMembers(guildId, searchParams);
        return {
          members: members.map((member: any) => ({
            user: member.user
              ? {
                  id: member.user.id,
                  username: member.user.username,
                  discriminator: member.user.discriminator,
                }
              : undefined,
            nick: member.nick,
            roles: member.roles,
            joined_at: member.joined_at,
          })),
        };
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        throw new Error(`Failed to get guild members: ${message}`);
      }
    },
  });

/**
 * BAN_MEMBER - Ban a member from a guild
 */
export const createBanMemberTool = (env: Env) =>
  createPrivateTool({
    id: "BAN_MEMBER",
    description:
      "Ban a user from a Discord server (guild). Can optionally delete messages from the banned user from the last 0-7 days. Requires BAN_MEMBERS permission.",
    inputSchema: banMemberInputSchema,
    outputSchema: banMemberOutputSchema,
    execute: async ({ context }) => {
      const { guildId, userId, deleteMessageDays = 0, reason } = context;
      const state = env.DECO_REQUEST_CONTEXT.state;

      if (deleteMessageDays < 0 || deleteMessageDays > 7) {
        throw new Error("deleteMessageDays must be between 0 and 7");
      }

      const client = createDiscordClient({ botToken: state.botToken });

      const body: any = {
        delete_message_days: deleteMessageDays,
      };

      if (reason) {
        body.reason = reason;
      }

      try {
        await client.banMember(guildId, userId, body);
        return {
          success: true,
          message: "Member banned successfully",
        };
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        throw new Error(`Failed to ban member: ${message}`);
      }
    },
  });

/**
 * GET_CURRENT_USER - Get information about the bot's user account
 */
export const createGetCurrentDiscordUserTool = (env: Env) =>
  createPrivateTool({
    id: "GET_CURRENT_DISCORD_USER",
    description:
      "Get information about the bot's own user account including username, discriminator, ID, and bot status.",
    inputSchema: getCurrentUserInputSchema,
    outputSchema: getCurrentUserOutputSchema,
    execute: async () => {
      const state = env.DECO_REQUEST_CONTEXT.state;

      const client = createDiscordClient({ botToken: state.botToken });

      try {
        const user = await client.getCurrentUser();
        return {
          id: user.id,
          username: user.username,
          discriminator: user.discriminator,
          bot: user.bot,
        };
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        throw new Error(`Failed to get current user: ${message}`);
      }
    },
  });

/**
 * GET_USER - Get information about a specific user
 */
export const createGetDiscordUserTool = (env: Env) =>
  createPrivateTool({
    id: "GET_DISCORD_USER",
    description:
      "Get information about a specific Discord user by their user ID. Returns username, discriminator, and public profile information.",
    inputSchema: getUserInputSchema,
    outputSchema: getUserOutputSchema,
    execute: async ({ context }) => {
      const { userId } = context;
      const state = env.DECO_REQUEST_CONTEXT.state;

      const client = createDiscordClient({ botToken: state.botToken });

      try {
        const user = await client.getUser(userId);
        return {
          id: user.id,
          username: user.username,
          discriminator: user.discriminator,
          bot: user.bot,
        };
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        throw new Error(`Failed to get user: ${message}`);
      }
    },
  });

/**
 * Array of all guild-related tools
 */
export const guildTools = [
  createListBotGuildsTool,
  createGetGuildTool,
  createGetGuildMembersTool,
  createBanMemberTool,
  createGetCurrentDiscordUserTool,
  createGetDiscordUserTool,
];
