/**
 * Discord Guild Tools
 *
 * Tools for managing guilds, members, and roles.
 */

import { createPrivateTool } from "@decocms/runtime/tools";
import z from "zod";
import type { Env } from "../../types/env.ts";
import { discordAPI } from "./api.ts";

// ============================================================================
// Get Guild
// ============================================================================

export const createGetGuildTool = (env: Env) =>
  createPrivateTool({
    id: "DISCORD_GET_GUILD",
    description: "Get information about a Discord guild",
    inputSchema: z
      .object({
        guild_id: z.string().describe("The guild ID"),
        with_counts: z
          .boolean()
          .default(true)
          .describe("Include member/presence counts"),
      })
      .strict(),
    outputSchema: z
      .object({
        id: z.string(),
        name: z.string(),
        icon: z.string().nullable(),
        owner_id: z.string(),
        member_count: z.number().optional(),
        presence_count: z.number().optional(),
        description: z.string().nullable(),
        premium_tier: z.number(),
        features: z.array(z.string()),
      })
      .strict(),
    execute: async ({ context }: { context: unknown }) => {
      const input = context as { guild_id: string; with_counts: boolean };

      const params = input.with_counts ? "?with_counts=true" : "";

      const result = await discordAPI<{
        id: string;
        name: string;
        icon: string | null;
        owner_id: string;
        approximate_member_count?: number;
        approximate_presence_count?: number;
        description: string | null;
        premium_tier: number;
        features: string[];
      }>(env, `/guilds/${input.guild_id}${params}`);

      return {
        id: result.id,
        name: result.name,
        icon: result.icon,
        owner_id: result.owner_id,
        member_count: result.approximate_member_count,
        presence_count: result.approximate_presence_count,
        description: result.description,
        premium_tier: result.premium_tier,
        features: result.features,
      };
    },
  });

// ============================================================================
// List Bot Guilds
// ============================================================================

export const createListBotGuildsTool = (env: Env) =>
  createPrivateTool({
    id: "DISCORD_LIST_BOT_GUILDS",
    description: "List all guilds where the bot is present",
    inputSchema: z
      .object({
        limit: z.number().min(1).max(200).default(100).describe("Max guilds"),
        before: z.string().optional().describe("Get guilds before this ID"),
        after: z.string().optional().describe("Get guilds after this ID"),
      })
      .strict(),
    outputSchema: z
      .object({
        guilds: z.array(
          z.object({
            id: z.string(),
            name: z.string(),
            icon: z.string().nullable(),
            owner: z.boolean(),
            permissions: z.string(),
          }),
        ),
        count: z.number(),
      })
      .strict(),
    execute: async ({ context }: { context: unknown }) => {
      const input = context as {
        limit: number;
        before?: string;
        after?: string;
      };

      const params = new URLSearchParams();
      params.set("limit", String(input.limit));
      if (input.before) params.set("before", input.before);
      if (input.after) params.set("after", input.after);

      const guilds = await discordAPI<
        Array<{
          id: string;
          name: string;
          icon: string | null;
          owner: boolean;
          permissions: string;
        }>
      >(env, `/users/@me/guilds?${params.toString()}`);

      return {
        guilds,
        count: guilds.length,
      };
    },
  });

// ============================================================================
// Get Guild Members
// ============================================================================

export const createGetGuildMembersTool = (env: Env) =>
  createPrivateTool({
    id: "DISCORD_GET_MEMBERS",
    description: "List members of a Discord guild",
    inputSchema: z
      .object({
        guild_id: z.string().describe("The guild ID"),
        limit: z.number().min(1).max(1000).default(100).describe("Max members"),
        after: z.string().optional().describe("Get members after this user ID"),
      })
      .strict(),
    outputSchema: z
      .object({
        members: z.array(
          z.object({
            user_id: z.string(),
            username: z.string(),
            nick: z.string().nullable(),
            roles: z.array(z.string()),
            joined_at: z.string(),
            bot: z.boolean(),
          }),
        ),
        count: z.number(),
      })
      .strict(),
    execute: async ({ context }: { context: unknown }) => {
      const input = context as {
        guild_id: string;
        limit: number;
        after?: string;
      };

      const params = new URLSearchParams();
      params.set("limit", String(input.limit));
      if (input.after) params.set("after", input.after);

      const members = await discordAPI<
        Array<{
          user: { id: string; username: string; bot?: boolean };
          nick: string | null;
          roles: string[];
          joined_at: string;
        }>
      >(env, `/guilds/${input.guild_id}/members?${params.toString()}`);

      return {
        members: members.map((m) => ({
          user_id: m.user.id,
          username: m.user.username,
          nick: m.nick,
          roles: m.roles,
          joined_at: m.joined_at,
          bot: m.user.bot ?? false,
        })),
        count: members.length,
      };
    },
  });

// ============================================================================
// Get User (global info only)
// ============================================================================

export const createGetUserTool = (env: Env) =>
  createPrivateTool({
    id: "DISCORD_GET_USER",
    description:
      "Get GLOBAL information about a Discord user (no roles/server info). Use DISCORD_GET_MEMBER for server-specific info like roles.",
    inputSchema: z
      .object({
        user_id: z.string().describe("The user ID"),
      })
      .strict(),
    outputSchema: z
      .object({
        id: z.string(),
        username: z.string(),
        global_name: z.string().nullable(),
        avatar: z.string().nullable(),
        bot: z.boolean(),
        banner: z.string().nullable(),
        accent_color: z.number().nullable(),
      })
      .strict(),
    execute: async ({ context }: { context: unknown }) => {
      const input = context as { user_id: string };

      const result = await discordAPI<{
        id: string;
        username: string;
        global_name: string | null;
        avatar: string | null;
        bot?: boolean;
        banner: string | null;
        accent_color: number | null;
      }>(env, `/users/${input.user_id}`);

      return {
        id: result.id,
        username: result.username,
        global_name: result.global_name,
        avatar: result.avatar,
        bot: result.bot ?? false,
        banner: result.banner,
        accent_color: result.accent_color,
      };
    },
  });

// ============================================================================
// Get Guild Member (with roles and server-specific info)
// ============================================================================

export const createGetMemberTool = (env: Env) =>
  createPrivateTool({
    id: "DISCORD_GET_MEMBER",
    description:
      "Get a member's info in a server INCLUDING their roles, nickname, join date. Use this to check user roles!",
    inputSchema: z
      .object({
        guild_id: z.string().describe("The guild/server ID"),
        user_id: z.string().describe("The user ID"),
      })
      .strict(),
    outputSchema: z
      .object({
        user: z.object({
          id: z.string(),
          username: z.string(),
          global_name: z.string().nullable(),
          avatar: z.string().nullable(),
          bot: z.boolean(),
        }),
        nick: z.string().nullable(),
        roles: z.array(z.string()),
        joined_at: z.string(),
        premium_since: z.string().nullable(),
        deaf: z.boolean(),
        mute: z.boolean(),
        pending: z.boolean().optional(),
        communication_disabled_until: z.string().nullable().optional(),
      })
      .passthrough(),
    execute: async ({ context }: { context: unknown }) => {
      const input = context as { guild_id: string; user_id: string };

      const result = await discordAPI<{
        user: {
          id: string;
          username: string;
          global_name: string | null;
          avatar: string | null;
          bot?: boolean;
        };
        nick: string | null;
        roles: string[];
        joined_at: string;
        premium_since: string | null;
        deaf: boolean;
        mute: boolean;
        pending?: boolean;
        communication_disabled_until?: string | null;
      }>(env, `/guilds/${input.guild_id}/members/${input.user_id}`);

      return {
        user: {
          id: result.user.id,
          username: result.user.username,
          global_name: result.user.global_name,
          avatar: result.user.avatar,
          bot: result.user.bot ?? false,
        },
        nick: result.nick,
        roles: result.roles,
        joined_at: result.joined_at,
        premium_since: result.premium_since,
        deaf: result.deaf,
        mute: result.mute,
        pending: result.pending,
        communication_disabled_until: result.communication_disabled_until,
      };
    },
  });

// ============================================================================
// Get Current User
// ============================================================================

export const createGetCurrentUserTool = (env: Env) =>
  createPrivateTool({
    id: "DISCORD_GET_BOT_USER",
    description: "Get information about the bot's own user account",
    inputSchema: z.object({}).strict(),
    outputSchema: z
      .object({
        id: z.string(),
        username: z.string(),
        avatar: z.string().nullable(),
        bot: z.boolean(),
      })
      .strict(),
    execute: async () => {
      const result = await discordAPI<{
        id: string;
        username: string;
        avatar: string | null;
        bot?: boolean;
      }>(env, `/users/@me`);

      return {
        id: result.id,
        username: result.username,
        avatar: result.avatar,
        bot: result.bot ?? true,
      };
    },
  });

// ============================================================================
// Ban Member
// ============================================================================

export const createBanMemberTool = (env: Env) =>
  createPrivateTool({
    id: "DISCORD_BAN_MEMBER",
    description: "Ban a member from a Discord server",
    inputSchema: z
      .object({
        guild_id: z.string().describe("The guild ID"),
        user_id: z.string().describe("The user ID to ban"),
        delete_message_days: z
          .number()
          .min(0)
          .max(7)
          .optional()
          .describe("Days of messages to delete (0-7)"),
        reason: z.string().optional().describe("Reason for ban (audit log)"),
      })
      .strict(),
    outputSchema: z.object({ success: z.boolean() }).strict(),
    execute: async ({ context }: { context: unknown }) => {
      const input = context as {
        guild_id: string;
        user_id: string;
        delete_message_days?: number;
        reason?: string;
      };

      const body: Record<string, unknown> = {};
      if (input.delete_message_days !== undefined) {
        body.delete_message_seconds = input.delete_message_days * 86400;
      }

      await discordAPI(env, `/guilds/${input.guild_id}/bans/${input.user_id}`, {
        method: "PUT",
        body,
        reason: input.reason,
      });

      return { success: true };
    },
  });

// ============================================================================
// Get Guild Roles
// ============================================================================

export const createGetGuildRolesTool = (env: Env) =>
  createPrivateTool({
    id: "DISCORD_GET_ROLES",
    description: "Get all roles from a Discord server",
    inputSchema: z
      .object({
        guild_id: z.string().describe("The guild ID"),
      })
      .strict(),
    outputSchema: z
      .object({
        roles: z.array(
          z.object({
            id: z.string(),
            name: z.string(),
            color: z.number(),
            position: z.number(),
            permissions: z.string(),
            mentionable: z.boolean(),
            managed: z.boolean(),
          }),
        ),
        count: z.number(),
      })
      .strict(),
    execute: async ({ context }: { context: unknown }) => {
      const input = context as { guild_id: string };

      const roles = await discordAPI<
        Array<{
          id: string;
          name: string;
          color: number;
          position: number;
          permissions: string;
          mentionable: boolean;
          managed: boolean;
        }>
      >(env, `/guilds/${input.guild_id}/roles`);

      return {
        roles: roles.map((r) => ({
          id: r.id,
          name: r.name,
          color: r.color,
          position: r.position,
          permissions: r.permissions,
          mentionable: r.mentionable,
          managed: r.managed,
        })),
        count: roles.length,
      };
    },
  });

// ============================================================================
// Create Role
// ============================================================================

export const createCreateRoleTool = (env: Env) =>
  createPrivateTool({
    id: "DISCORD_CREATE_ROLE",
    description: "Create a new role in a Discord server",
    inputSchema: z
      .object({
        guild_id: z.string().describe("The guild ID"),
        name: z.string().describe("Role name"),
        color: z.number().optional().describe("Role color (integer)"),
        hoist: z
          .boolean()
          .optional()
          .describe("Display role members separately"),
        mentionable: z.boolean().optional().describe("Allow anyone to mention"),
        reason: z.string().optional().describe("Reason (audit log)"),
      })
      .strict(),
    outputSchema: z
      .object({
        id: z.string(),
        name: z.string(),
        color: z.number(),
        position: z.number(),
      })
      .strict(),
    execute: async ({ context }: { context: unknown }) => {
      const input = context as {
        guild_id: string;
        name: string;
        color?: number;
        hoist?: boolean;
        mentionable?: boolean;
        reason?: string;
      };

      const body: Record<string, unknown> = { name: input.name };
      if (input.color !== undefined) body.color = input.color;
      if (input.hoist !== undefined) body.hoist = input.hoist;
      if (input.mentionable !== undefined) body.mentionable = input.mentionable;

      const result = await discordAPI<{
        id: string;
        name: string;
        color: number;
        position: number;
      }>(env, `/guilds/${input.guild_id}/roles`, {
        method: "POST",
        body,
        reason: input.reason,
      });

      return result;
    },
  });

// ============================================================================
// Edit Role
// ============================================================================

export const createEditRoleTool = (env: Env) =>
  createPrivateTool({
    id: "DISCORD_EDIT_ROLE",
    description: "Edit an existing role in a Discord server",
    inputSchema: z
      .object({
        guild_id: z.string().describe("The guild ID"),
        role_id: z.string().describe("The role ID to edit"),
        name: z.string().optional().describe("New role name"),
        color: z.number().optional().describe("New role color"),
        hoist: z.boolean().optional().describe("Display separately"),
        mentionable: z.boolean().optional().describe("Allow mentions"),
        reason: z.string().optional().describe("Reason (audit log)"),
      })
      .strict(),
    outputSchema: z
      .object({
        id: z.string(),
        name: z.string(),
        color: z.number(),
      })
      .strict(),
    execute: async ({ context }: { context: unknown }) => {
      const input = context as {
        guild_id: string;
        role_id: string;
        name?: string;
        color?: number;
        hoist?: boolean;
        mentionable?: boolean;
        reason?: string;
      };

      const body: Record<string, unknown> = {};
      if (input.name !== undefined) body.name = input.name;
      if (input.color !== undefined) body.color = input.color;
      if (input.hoist !== undefined) body.hoist = input.hoist;
      if (input.mentionable !== undefined) body.mentionable = input.mentionable;

      const result = await discordAPI<{
        id: string;
        name: string;
        color: number;
      }>(env, `/guilds/${input.guild_id}/roles/${input.role_id}`, {
        method: "PATCH",
        body,
        reason: input.reason,
      });

      return result;
    },
  });

// ============================================================================
// Delete Role
// ============================================================================

export const createDeleteRoleTool = (env: Env) =>
  createPrivateTool({
    id: "DISCORD_DELETE_ROLE",
    description: "Delete a role from a Discord server",
    inputSchema: z
      .object({
        guild_id: z.string().describe("The guild ID"),
        role_id: z.string().describe("The role ID to delete"),
        reason: z.string().optional().describe("Reason (audit log)"),
      })
      .strict(),
    outputSchema: z.object({ success: z.boolean() }).strict(),
    execute: async ({ context }: { context: unknown }) => {
      const input = context as {
        guild_id: string;
        role_id: string;
        reason?: string;
      };

      await discordAPI(
        env,
        `/guilds/${input.guild_id}/roles/${input.role_id}`,
        {
          method: "DELETE",
          reason: input.reason,
        },
      );

      return { success: true };
    },
  });

// ============================================================================
// Export
// ============================================================================

export const discordGuildTools = [
  createGetGuildTool,
  createListBotGuildsTool,
  createGetGuildMembersTool,
  createGetUserTool,
  createGetMemberTool, // New! For getting roles and server-specific info
  createGetCurrentUserTool,
  createBanMemberTool,
  createGetGuildRolesTool,
  createCreateRoleTool,
  createEditRoleTool,
  createDeleteRoleTool,
];
