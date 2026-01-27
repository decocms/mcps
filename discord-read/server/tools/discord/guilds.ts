/**
 * Discord Guild Tools
 *
 * Tools for managing guilds, members, and roles.
 */

import { createPrivateTool } from "@decocms/runtime/tools";
import z from "zod";
import type { Env } from "../../types/env.ts";
import { discordAPI, discordAPIBatch } from "./api.ts";

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
            banner: z.string().optional(),
            features: z.array(z.string()).optional(),
            approximate_member_count: z.number().optional(),
            approximate_presence_count: z.number().optional(),
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
// Search Members by Name
// ============================================================================

export const createSearchMembersTool = (env: Env) =>
  createPrivateTool({
    id: "DISCORD_SEARCH_MEMBERS",
    description:
      "Search guild members by username or nickname. Returns members whose username or nickname starts with the query.",
    inputSchema: z
      .object({
        guild_id: z.string().describe("The guild ID"),
        query: z
          .string()
          .min(1)
          .describe("Username or nickname to search (prefix match)"),
        limit: z
          .number()
          .min(1)
          .max(1000)
          .default(100)
          .describe("Max members to return"),
      })
      .strict(),
    outputSchema: z
      .object({
        members: z.array(
          z.object({
            user_id: z.string(),
            username: z.string(),
            global_name: z.string().nullable(),
            nick: z.string().nullable(),
            avatar: z.string().nullable(),
            roles: z.array(z.string()),
            joined_at: z.string(),
            bot: z.boolean(),
          }),
        ),
        count: z.number(),
        query: z.string(),
      })
      .strict(),
    execute: async ({ context }: { context: unknown }) => {
      const input = context as {
        guild_id: string;
        query: string;
        limit: number;
      };

      const params = new URLSearchParams();
      params.set("query", input.query);
      params.set("limit", String(input.limit));

      const members = await discordAPI<
        Array<{
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
        }>
      >(env, `/guilds/${input.guild_id}/members/search?${params.toString()}`);

      return {
        members: members.map((m) => ({
          user_id: m.user.id,
          username: m.user.username,
          global_name: m.user.global_name,
          nick: m.nick,
          avatar: m.user.avatar,
          roles: m.roles,
          joined_at: m.joined_at,
          bot: m.user.bot ?? false,
        })),
        count: members.length,
        query: input.query,
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
// Ban Member (supports single or multiple users)
// ============================================================================

export const createBanMemberTool = (env: Env) =>
  createPrivateTool({
    id: "DISCORD_BAN_MEMBER",
    description:
      "Ban one or more members from a Discord server. Supports batch operations with rate limit handling.",
    inputSchema: z
      .object({
        guild_id: z.string().describe("The guild ID"),
        user_id: z.string().optional().describe("Single user ID to ban"),
        user_ids: z
          .array(z.string())
          .optional()
          .describe(
            "Array of user IDs to ban (processed with rate limit handling)",
          ),
        delete_message_days: z
          .number()
          .min(0)
          .max(7)
          .optional()
          .describe("Days of messages to delete (0-7)"),
        reason: z.string().optional().describe("Reason for ban (audit log)"),
      })
      .strict(),
    outputSchema: z
      .object({
        success: z.boolean(),
        banned_count: z.number(),
        failed_count: z.number(),
        errors: z
          .array(z.object({ user_id: z.string(), error: z.string() }))
          .optional(),
      })
      .strict(),
    execute: async ({ context }: { context: unknown }) => {
      const input = context as {
        guild_id: string;
        user_id?: string;
        user_ids?: string[];
        delete_message_days?: number;
        reason?: string;
      };

      const usersToBan: string[] = [];
      if (input.user_id) usersToBan.push(input.user_id);
      if (input.user_ids) usersToBan.push(...input.user_ids);

      if (usersToBan.length === 0) {
        throw new Error("Either user_id or user_ids must be provided");
      }

      const body: Record<string, unknown> = {};
      if (input.delete_message_days !== undefined) {
        body.delete_message_seconds = input.delete_message_days * 86400;
      }

      // Single user - simple ban
      if (usersToBan.length === 1) {
        await discordAPI(
          env,
          `/guilds/${input.guild_id}/bans/${usersToBan[0]}`,
          { method: "PUT", body, reason: input.reason },
        );
        return { success: true, banned_count: 1, failed_count: 0 };
      }

      // Multiple users - batch ban
      console.log(
        `🔨 [Ban] Banning ${usersToBan.length} users from guild ${input.guild_id}...`,
      );

      const { results, errors } = await discordAPIBatch(
        env,
        usersToBan,
        async (userId) => {
          await discordAPI(env, `/guilds/${input.guild_id}/bans/${userId}`, {
            method: "PUT",
            body,
            reason: input.reason,
          });
          return userId;
        },
        {
          delayMs: 300,
          onProgress: (completed, total) => {
            if (completed % 5 === 0 || completed === total) {
              console.log(`🔨 [Ban] Progress: ${completed}/${total}`);
            }
          },
          onError: () => "skip",
        },
      );

      console.log(
        `✅ [Ban] Completed: ${results.length} banned, ${errors.length} failed`,
      );

      return {
        success: errors.length === 0,
        banned_count: results.length,
        failed_count: errors.length,
        errors:
          errors.length > 0
            ? errors.map((e) => ({ user_id: e.item, error: e.error }))
            : undefined,
      };
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
// Delete Role (supports multiple roles)
// ============================================================================

export const createDeleteRoleTool = (env: Env) =>
  createPrivateTool({
    id: "DISCORD_DELETE_ROLE",
    description:
      "Delete one or more roles from a Discord server. Supports batch operations.",
    inputSchema: z
      .object({
        guild_id: z.string().describe("The guild ID"),
        role_id: z.string().optional().describe("Single role ID to delete"),
        role_ids: z
          .array(z.string())
          .optional()
          .describe("Array of role IDs to delete"),
        reason: z.string().optional().describe("Reason (audit log)"),
      })
      .strict(),
    outputSchema: z
      .object({
        success: z.boolean(),
        deleted_count: z.number(),
        failed_count: z.number(),
        errors: z
          .array(z.object({ role_id: z.string(), error: z.string() }))
          .optional(),
      })
      .strict(),
    execute: async ({ context }: { context: unknown }) => {
      const input = context as {
        guild_id: string;
        role_id?: string;
        role_ids?: string[];
        reason?: string;
      };

      const roles: string[] = [];
      if (input.role_id) roles.push(input.role_id);
      if (input.role_ids) roles.push(...input.role_ids);

      if (roles.length === 0) {
        throw new Error("Either role_id or role_ids must be provided");
      }

      // Single role - simple delete
      if (roles.length === 1) {
        await discordAPI(env, `/guilds/${input.guild_id}/roles/${roles[0]}`, {
          method: "DELETE",
          reason: input.reason,
        });
        return { success: true, deleted_count: 1, failed_count: 0 };
      }

      // Multiple roles - batch delete
      console.log(
        `🗑️ [Role] Deleting ${roles.length} roles from guild ${input.guild_id}...`,
      );

      const { results, errors } = await discordAPIBatch(
        env,
        roles,
        async (roleId) => {
          await discordAPI(env, `/guilds/${input.guild_id}/roles/${roleId}`, {
            method: "DELETE",
            reason: input.reason,
          });
          return roleId;
        },
        {
          delayMs: 300,
          onProgress: (completed, total) => {
            if (completed % 5 === 0 || completed === total) {
              console.log(`🗑️ [Role] Progress: ${completed}/${total}`);
            }
          },
          onError: () => "skip",
        },
      );

      console.log(
        `✅ [Role] Completed: ${results.length} deleted, ${errors.length} failed`,
      );

      return {
        success: errors.length === 0,
        deleted_count: results.length,
        failed_count: errors.length,
        errors:
          errors.length > 0
            ? errors.map((e) => ({ role_id: e.item, error: e.error }))
            : undefined,
      };
    },
  });

// ============================================================================
// Add Role to Member (supports multiple users)
// ============================================================================

export const createAddRoleToMemberTool = (env: Env) =>
  createPrivateTool({
    id: "DISCORD_ADD_ROLE",
    description:
      "Add a role to one or more guild members. Supports batch operations with rate limit handling.",
    inputSchema: z
      .object({
        guild_id: z.string().describe("The guild ID"),
        user_id: z.string().optional().describe("Single user ID"),
        user_ids: z
          .array(z.string())
          .optional()
          .describe("Array of user IDs to add the role to"),
        role_id: z.string().describe("The role ID to add"),
        reason: z.string().optional().describe("Reason for audit log"),
      })
      .strict(),
    outputSchema: z
      .object({
        success: z.boolean(),
        added_count: z.number(),
        failed_count: z.number(),
        message: z.string(),
        errors: z
          .array(z.object({ user_id: z.string(), error: z.string() }))
          .optional(),
      })
      .strict(),
    execute: async ({ context }: { context: unknown }) => {
      const input = context as {
        guild_id: string;
        user_id?: string;
        user_ids?: string[];
        role_id: string;
        reason?: string;
      };

      const users: string[] = [];
      if (input.user_id) users.push(input.user_id);
      if (input.user_ids) users.push(...input.user_ids);

      if (users.length === 0) {
        throw new Error("Either user_id or user_ids must be provided");
      }

      // Single user - simple add
      if (users.length === 1) {
        await discordAPI(
          env,
          `/guilds/${input.guild_id}/members/${users[0]}/roles/${input.role_id}`,
          { method: "PUT", reason: input.reason },
        );
        return {
          success: true,
          added_count: 1,
          failed_count: 0,
          message: `Role ${input.role_id} added to user ${users[0]}`,
        };
      }

      // Multiple users - batch add
      console.log(
        `➕ [Role] Adding role ${input.role_id} to ${users.length} users...`,
      );

      const { results, errors } = await discordAPIBatch(
        env,
        users,
        async (userId) => {
          await discordAPI(
            env,
            `/guilds/${input.guild_id}/members/${userId}/roles/${input.role_id}`,
            { method: "PUT", reason: input.reason },
          );
          return userId;
        },
        {
          delayMs: 200,
          onProgress: (completed, total) => {
            if (completed % 10 === 0 || completed === total) {
              console.log(`➕ [Role] Progress: ${completed}/${total}`);
            }
          },
          onError: () => "skip",
        },
      );

      console.log(
        `✅ [Role] Completed: ${results.length} added, ${errors.length} failed`,
      );

      return {
        success: errors.length === 0,
        added_count: results.length,
        failed_count: errors.length,
        message: `Role added to ${results.length} of ${users.length} users`,
        errors:
          errors.length > 0
            ? errors.map((e) => ({ user_id: e.item, error: e.error }))
            : undefined,
      };
    },
  });

// ============================================================================
// Remove Role from Member (supports multiple users)
// ============================================================================

export const createRemoveRoleFromMemberTool = (env: Env) =>
  createPrivateTool({
    id: "DISCORD_REMOVE_ROLE",
    description:
      "Remove a role from one or more guild members. Supports batch operations with rate limit handling.",
    inputSchema: z
      .object({
        guild_id: z.string().describe("The guild ID"),
        user_id: z.string().optional().describe("Single user ID"),
        user_ids: z
          .array(z.string())
          .optional()
          .describe("Array of user IDs to remove the role from"),
        role_id: z.string().describe("The role ID to remove"),
        reason: z.string().optional().describe("Reason for audit log"),
      })
      .strict(),
    outputSchema: z
      .object({
        success: z.boolean(),
        removed_count: z.number(),
        failed_count: z.number(),
        message: z.string(),
        errors: z
          .array(z.object({ user_id: z.string(), error: z.string() }))
          .optional(),
      })
      .strict(),
    execute: async ({ context }: { context: unknown }) => {
      const input = context as {
        guild_id: string;
        user_id?: string;
        user_ids?: string[];
        role_id: string;
        reason?: string;
      };

      const users: string[] = [];
      if (input.user_id) users.push(input.user_id);
      if (input.user_ids) users.push(...input.user_ids);

      if (users.length === 0) {
        throw new Error("Either user_id or user_ids must be provided");
      }

      // Single user - simple remove
      if (users.length === 1) {
        await discordAPI(
          env,
          `/guilds/${input.guild_id}/members/${users[0]}/roles/${input.role_id}`,
          { method: "DELETE", reason: input.reason },
        );
        return {
          success: true,
          removed_count: 1,
          failed_count: 0,
          message: `Role ${input.role_id} removed from user ${users[0]}`,
        };
      }

      // Multiple users - batch remove
      console.log(
        `➖ [Role] Removing role ${input.role_id} from ${users.length} users...`,
      );

      const { results, errors } = await discordAPIBatch(
        env,
        users,
        async (userId) => {
          await discordAPI(
            env,
            `/guilds/${input.guild_id}/members/${userId}/roles/${input.role_id}`,
            { method: "DELETE", reason: input.reason },
          );
          return userId;
        },
        {
          delayMs: 200,
          onProgress: (completed, total) => {
            if (completed % 10 === 0 || completed === total) {
              console.log(`➖ [Role] Progress: ${completed}/${total}`);
            }
          },
          onError: () => "skip",
        },
      );

      console.log(
        `✅ [Role] Completed: ${results.length} removed, ${errors.length} failed`,
      );

      return {
        success: errors.length === 0,
        removed_count: results.length,
        failed_count: errors.length,
        message: `Role removed from ${results.length} of ${users.length} users`,
        errors:
          errors.length > 0
            ? errors.map((e) => ({ user_id: e.item, error: e.error }))
            : undefined,
      };
    },
  });

// ============================================================================
// Edit Member (nickname, roles, mute, deaf, etc.)
// ============================================================================

export const createEditMemberTool = (env: Env) =>
  createPrivateTool({
    id: "DISCORD_EDIT_MEMBER",
    description:
      "Edit a guild member's attributes (nickname, roles, mute, deaf, etc.)",
    inputSchema: z
      .object({
        guild_id: z.string().describe("The guild ID"),
        user_id: z.string().describe("The user ID of the member"),
        nick: z
          .string()
          .nullable()
          .optional()
          .describe("New nickname (null to reset)"),
        roles: z
          .array(z.string())
          .optional()
          .describe("Array of role IDs to set (replaces all roles)"),
        mute: z.boolean().optional().describe("Mute in voice channels"),
        deaf: z.boolean().optional().describe("Deafen in voice channels"),
        channel_id: z
          .string()
          .nullable()
          .optional()
          .describe("Move to voice channel (null to disconnect)"),
        communication_disabled_until: z
          .string()
          .nullable()
          .optional()
          .describe("Timeout until ISO8601 timestamp (null to remove)"),
        reason: z.string().optional().describe("Reason for audit log"),
      })
      .strict(),
    outputSchema: z
      .object({
        success: z.boolean(),
        message: z.string(),
      })
      .strict(),
    execute: async ({ context }: { context: unknown }) => {
      const input = context as {
        guild_id: string;
        user_id: string;
        nick?: string | null;
        roles?: string[];
        mute?: boolean;
        deaf?: boolean;
        channel_id?: string | null;
        communication_disabled_until?: string | null;
        reason?: string;
      };

      const body: Record<string, unknown> = {};
      if (input.nick !== undefined) body.nick = input.nick;
      if (input.roles !== undefined) body.roles = input.roles;
      if (input.mute !== undefined) body.mute = input.mute;
      if (input.deaf !== undefined) body.deaf = input.deaf;
      if (input.channel_id !== undefined) body.channel_id = input.channel_id;
      if (input.communication_disabled_until !== undefined) {
        body.communication_disabled_until = input.communication_disabled_until;
      }

      await discordAPI(
        env,
        `/guilds/${input.guild_id}/members/${input.user_id}`,
        {
          method: "PATCH",
          body,
          reason: input.reason,
        },
      );

      return {
        success: true,
        message: `Member ${input.user_id} updated successfully`,
      };
    },
  });

// ============================================================================
// Kick Member (supports multiple users)
// ============================================================================

export const createKickMemberTool = (env: Env) =>
  createPrivateTool({
    id: "DISCORD_KICK_MEMBER",
    description:
      "Kick one or more members from a Discord server (they can rejoin). Supports batch operations.",
    inputSchema: z
      .object({
        guild_id: z.string().describe("The guild ID"),
        user_id: z.string().optional().describe("Single user ID to kick"),
        user_ids: z
          .array(z.string())
          .optional()
          .describe("Array of user IDs to kick"),
        reason: z.string().optional().describe("Reason for audit log"),
      })
      .strict(),
    outputSchema: z
      .object({
        success: z.boolean(),
        kicked_count: z.number(),
        failed_count: z.number(),
        message: z.string(),
        errors: z
          .array(z.object({ user_id: z.string(), error: z.string() }))
          .optional(),
      })
      .strict(),
    execute: async ({ context }: { context: unknown }) => {
      const input = context as {
        guild_id: string;
        user_id?: string;
        user_ids?: string[];
        reason?: string;
      };

      const users: string[] = [];
      if (input.user_id) users.push(input.user_id);
      if (input.user_ids) users.push(...input.user_ids);

      if (users.length === 0) {
        throw new Error("Either user_id or user_ids must be provided");
      }

      // Single user - simple kick
      if (users.length === 1) {
        await discordAPI(env, `/guilds/${input.guild_id}/members/${users[0]}`, {
          method: "DELETE",
          reason: input.reason,
        });
        return {
          success: true,
          kicked_count: 1,
          failed_count: 0,
          message: `User ${users[0]} kicked from guild ${input.guild_id}`,
        };
      }

      // Multiple users - batch kick
      console.log(
        `👢 [Kick] Kicking ${users.length} users from guild ${input.guild_id}...`,
      );

      const { results, errors } = await discordAPIBatch(
        env,
        users,
        async (userId) => {
          await discordAPI(env, `/guilds/${input.guild_id}/members/${userId}`, {
            method: "DELETE",
            reason: input.reason,
          });
          return userId;
        },
        {
          delayMs: 300,
          onProgress: (completed, total) => {
            if (completed % 5 === 0 || completed === total) {
              console.log(`👢 [Kick] Progress: ${completed}/${total}`);
            }
          },
          onError: () => "skip",
        },
      );

      console.log(
        `✅ [Kick] Completed: ${results.length} kicked, ${errors.length} failed`,
      );

      return {
        success: errors.length === 0,
        kicked_count: results.length,
        failed_count: errors.length,
        message: `Kicked ${results.length} of ${users.length} users`,
        errors:
          errors.length > 0
            ? errors.map((e) => ({ user_id: e.item, error: e.error }))
            : undefined,
      };
    },
  });

// ============================================================================
// Timeout Member (supports multiple users)
// ============================================================================

export const createTimeoutMemberTool = (env: Env) =>
  createPrivateTool({
    id: "DISCORD_TIMEOUT_MEMBER",
    description:
      "Timeout one or more members (prevent them from interacting) for a specified duration. Supports batch operations.",
    inputSchema: z
      .object({
        guild_id: z.string().describe("The guild ID"),
        user_id: z.string().optional().describe("Single user ID to timeout"),
        user_ids: z
          .array(z.string())
          .optional()
          .describe("Array of user IDs to timeout"),
        duration_minutes: z
          .number()
          .min(1)
          .max(40320)
          .describe("Duration in minutes (max 28 days = 40320)"),
        reason: z.string().optional().describe("Reason for audit log"),
      })
      .strict(),
    outputSchema: z
      .object({
        success: z.boolean(),
        timed_out_count: z.number(),
        failed_count: z.number(),
        message: z.string(),
        timeout_until: z.string(),
        errors: z
          .array(z.object({ user_id: z.string(), error: z.string() }))
          .optional(),
      })
      .strict(),
    execute: async ({ context }: { context: unknown }) => {
      const input = context as {
        guild_id: string;
        user_id?: string;
        user_ids?: string[];
        duration_minutes: number;
        reason?: string;
      };

      const users: string[] = [];
      if (input.user_id) users.push(input.user_id);
      if (input.user_ids) users.push(...input.user_ids);

      if (users.length === 0) {
        throw new Error("Either user_id or user_ids must be provided");
      }

      const timeoutUntil = new Date(
        Date.now() + input.duration_minutes * 60 * 1000,
      ).toISOString();

      // Single user - simple timeout
      if (users.length === 1) {
        await discordAPI(env, `/guilds/${input.guild_id}/members/${users[0]}`, {
          method: "PATCH",
          body: { communication_disabled_until: timeoutUntil },
          reason: input.reason,
        });
        return {
          success: true,
          timed_out_count: 1,
          failed_count: 0,
          message: `User ${users[0]} timed out for ${input.duration_minutes} minutes`,
          timeout_until: timeoutUntil,
        };
      }

      // Multiple users - batch timeout
      console.log(
        `⏱️ [Timeout] Timing out ${users.length} users for ${input.duration_minutes} minutes...`,
      );

      const { results, errors } = await discordAPIBatch(
        env,
        users,
        async (userId) => {
          await discordAPI(env, `/guilds/${input.guild_id}/members/${userId}`, {
            method: "PATCH",
            body: { communication_disabled_until: timeoutUntil },
            reason: input.reason,
          });
          return userId;
        },
        {
          delayMs: 200,
          onProgress: (completed, total) => {
            if (completed % 10 === 0 || completed === total) {
              console.log(`⏱️ [Timeout] Progress: ${completed}/${total}`);
            }
          },
          onError: () => "skip",
        },
      );

      console.log(
        `✅ [Timeout] Completed: ${results.length} timed out, ${errors.length} failed`,
      );

      return {
        success: errors.length === 0,
        timed_out_count: results.length,
        failed_count: errors.length,
        message: `Timed out ${results.length} of ${users.length} users for ${input.duration_minutes} minutes`,
        timeout_until: timeoutUntil,
        errors:
          errors.length > 0
            ? errors.map((e) => ({ user_id: e.item, error: e.error }))
            : undefined,
      };
    },
  });

// ============================================================================
// Remove Timeout (supports multiple users)
// ============================================================================

export const createRemoveTimeoutTool = (env: Env) =>
  createPrivateTool({
    id: "DISCORD_REMOVE_TIMEOUT",
    description:
      "Remove timeout from one or more members (allow them to interact again). Supports batch operations.",
    inputSchema: z
      .object({
        guild_id: z.string().describe("The guild ID"),
        user_id: z
          .string()
          .optional()
          .describe("Single user ID to remove timeout from"),
        user_ids: z
          .array(z.string())
          .optional()
          .describe("Array of user IDs to remove timeout from"),
        reason: z.string().optional().describe("Reason for audit log"),
      })
      .strict(),
    outputSchema: z
      .object({
        success: z.boolean(),
        removed_count: z.number(),
        failed_count: z.number(),
        message: z.string(),
        errors: z
          .array(z.object({ user_id: z.string(), error: z.string() }))
          .optional(),
      })
      .strict(),
    execute: async ({ context }: { context: unknown }) => {
      const input = context as {
        guild_id: string;
        user_id?: string;
        user_ids?: string[];
        reason?: string;
      };

      const users: string[] = [];
      if (input.user_id) users.push(input.user_id);
      if (input.user_ids) users.push(...input.user_ids);

      if (users.length === 0) {
        throw new Error("Either user_id or user_ids must be provided");
      }

      // Single user - simple remove
      if (users.length === 1) {
        await discordAPI(env, `/guilds/${input.guild_id}/members/${users[0]}`, {
          method: "PATCH",
          body: { communication_disabled_until: null },
          reason: input.reason,
        });
        return {
          success: true,
          removed_count: 1,
          failed_count: 0,
          message: `Timeout removed from user ${users[0]}`,
        };
      }

      // Multiple users - batch remove
      console.log(`⏱️ [Timeout] Removing timeout from ${users.length} users...`);

      const { results, errors } = await discordAPIBatch(
        env,
        users,
        async (userId) => {
          await discordAPI(env, `/guilds/${input.guild_id}/members/${userId}`, {
            method: "PATCH",
            body: { communication_disabled_until: null },
            reason: input.reason,
          });
          return userId;
        },
        {
          delayMs: 200,
          onProgress: (completed, total) => {
            if (completed % 10 === 0 || completed === total) {
              console.log(`⏱️ [Timeout] Progress: ${completed}/${total}`);
            }
          },
          onError: () => "skip",
        },
      );

      console.log(
        `✅ [Timeout] Completed: ${results.length} removed, ${errors.length} failed`,
      );

      return {
        success: errors.length === 0,
        removed_count: results.length,
        failed_count: errors.length,
        message: `Timeout removed from ${results.length} of ${users.length} users`,
        errors:
          errors.length > 0
            ? errors.map((e) => ({ user_id: e.item, error: e.error }))
            : undefined,
      };
    },
  });

// ============================================================================
// Export
// ============================================================================

export const discordGuildTools = [
  createGetGuildTool,
  createListBotGuildsTool,
  createGetGuildMembersTool,
  createSearchMembersTool,
  createGetUserTool,
  createGetMemberTool,
  createGetCurrentUserTool,
  createEditMemberTool,
  createAddRoleToMemberTool,
  createRemoveRoleFromMemberTool,
  createKickMemberTool,
  createBanMemberTool,
  createTimeoutMemberTool,
  createRemoveTimeoutTool,
  createGetGuildRolesTool,
  createCreateRoleTool,
  createEditRoleTool,
  createDeleteRoleTool,
];
