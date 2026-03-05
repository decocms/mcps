/**
 * Database Tools
 *
 * Secure tools for querying Discord data from Supabase.
 * Only accesses data from the current connection/organization.
 */

import { createPrivateTool } from "@decocms/runtime/tools";
import { z } from "zod";
import type { Env } from "../types/env.ts";
import { getSupabaseClient } from "../lib/supabase-client.ts";
import { invalidateChannelContextCache } from "../discord/handlers/messageHandler.ts";
import { invalidateAutoRespondCache } from "../discord/client.ts";

/**
 * Query Discord messages (read-only, scoped to connection)
 */
export const createQueryMessagesTool = (env: Env) =>
  createPrivateTool({
    id: "DISCORD_QUERY_MESSAGES",
    description:
      "Query Discord messages from the database. Only returns messages from guilds this bot has access to. Useful for searching message history, deleted messages, edit history, etc.",
    inputSchema: z
      .object({
        guildId: z.string().optional().describe("Filter by guild ID"),
        channelId: z.string().optional().describe("Filter by channel ID"),
        authorId: z.string().optional().describe("Filter by author user ID"),
        search: z
          .string()
          .optional()
          .describe("Search in message content (case-insensitive)"),
        deleted: z
          .boolean()
          .optional()
          .describe(
            "Filter deleted messages (true) or active messages (false)",
          ),
        limit: z
          .number()
          .default(50)
          .describe("Maximum number of messages to return (max 100)"),
        offset: z.number().default(0).describe("Offset for pagination"),
      })
      .strict(),
    outputSchema: z
      .object({
        success: z.boolean(),
        messages: z.array(
          z.object({
            id: z.string(),
            guild_id: z.string().nullable(),
            channel_id: z.string(),
            channel_name: z.string().nullable(),
            author_id: z.string(),
            author_username: z.string(),
            author_bot: z.boolean(),
            content: z.string().nullable(),
            deleted: z.boolean(),
            deleted_at: z.string().nullable(),
            created_at: z.string(),
            edited_at: z.string().nullable(),
          }),
        ),
        total: z.number(),
        message: z.string().optional(),
      })
      .strict(),
    execute: async (params: any) => {
      const { context } = params;
      const {
        guildId,
        channelId,
        authorId,
        search,
        deleted,
        limit: rawLimit,
        offset,
      } = context as {
        guildId?: string;
        channelId?: string;
        authorId?: string;
        search?: string;
        deleted?: boolean;
        limit: number;
        offset: number;
      };

      const client = getSupabaseClient();
      if (!client) {
        return {
          success: false,
          messages: [],
          total: 0,
          message:
            "Database not configured. Set SUPABASE_URL and SUPABASE_ANON_KEY.",
        };
      }

      try {
        // Limit to max 100 for safety
        const limit = Math.min(rawLimit || 50, 100);

        // Build query
        let query = client
          .from("discord_message")
          .select("*", { count: "exact" });

        // Apply filters
        if (guildId) {
          query = query.eq("guild_id", guildId);
        }
        if (channelId) {
          query = query.eq("channel_id", channelId);
        }
        if (authorId) {
          query = query.eq("author_id", authorId);
        }
        if (search) {
          query = query.ilike("content", `%${search}%`);
        }
        if (deleted !== undefined) {
          query = query.eq("deleted", deleted);
        }

        // Order and pagination
        query = query
          .order("created_at", { ascending: false })
          .range(offset, offset + limit - 1);

        const { data, error, count } = await query;

        if (error) {
          return {
            success: false,
            messages: [],
            total: 0,
            message: `Query failed: ${error.message}`,
          };
        }

        return {
          success: true,
          messages: data || [],
          total: count || 0,
          message: `Found ${count || 0} messages`,
        };
      } catch (error) {
        return {
          success: false,
          messages: [],
          total: 0,
          message: `Error: ${error instanceof Error ? error.message : "Unknown error"}`,
        };
      }
    },
  });

/**
 * Query Discord guilds (read-only)
 */
export const createQueryGuildsTool = (env: Env) =>
  createPrivateTool({
    id: "DISCORD_QUERY_GUILDS",
    description: "Query Discord guilds (servers) from the database.",
    inputSchema: z.object({}).strict(),
    outputSchema: z
      .object({
        success: z.boolean(),
        guilds: z.array(
          z.object({
            id: z.string(),
            name: z.string().nullable(),
            icon: z.string().nullable(),
            owner_id: z.string().nullable(),
            command_prefix: z.string(),
            created_at: z.string(),
            updated_at: z.string(),
          }),
        ),
        total: z.number(),
        message: z.string().optional(),
      })
      .strict(),
    execute: async () => {
      const client = getSupabaseClient();
      if (!client) {
        return {
          success: false,
          guilds: [],
          total: 0,
          message: "Database not configured",
        };
      }

      try {
        const { data, error, count } = await client
          .from("guilds")
          .select("*", { count: "exact" })
          .order("name");

        if (error) {
          return {
            success: false,
            guilds: [],
            total: 0,
            message: `Query failed: ${error.message}`,
          };
        }

        return {
          success: true,
          guilds: data || [],
          total: count || 0,
        };
      } catch (error) {
        return {
          success: false,
          guilds: [],
          total: 0,
          message: `Error: ${error instanceof Error ? error.message : "Unknown error"}`,
        };
      }
    },
  });

/**
 * Query message statistics
 */
export const createMessageStatsTool = (env: Env) =>
  createPrivateTool({
    id: "DISCORD_MESSAGE_STATS",
    description:
      "Get statistics about Discord messages (total, by channel, by author, etc.)",
    inputSchema: z
      .object({
        guildId: z.string().optional().describe("Filter by guild ID"),
        channelId: z.string().optional().describe("Filter by channel ID"),
      })
      .strict(),
    outputSchema: z
      .object({
        success: z.boolean(),
        stats: z.object({
          total: z.number(),
          active: z.number(),
          deleted: z.number(),
          edited: z.number(),
        }),
        message: z.string().optional(),
      })
      .strict(),
    execute: async (params: any) => {
      const { context } = params;
      const { guildId, channelId } = context as {
        guildId?: string;
        channelId?: string;
      };

      const client = getSupabaseClient();
      if (!client) {
        return {
          success: false,
          stats: { total: 0, active: 0, deleted: 0, edited: 0 },
          message: "Database not configured",
        };
      }

      try {
        // Build base query
        let baseQuery = client
          .from("discord_message")
          .select("*", { count: "exact", head: true });

        if (guildId) {
          baseQuery = baseQuery.eq("guild_id", guildId);
        }
        if (channelId) {
          baseQuery = baseQuery.eq("channel_id", channelId);
        }

        // Get totals
        const { count: total } = await baseQuery;

        // Get active (not deleted)
        let activeQuery = client
          .from("discord_message")
          .select("*", { count: "exact", head: true })
          .eq("deleted", false);
        if (guildId) activeQuery = activeQuery.eq("guild_id", guildId);
        if (channelId) activeQuery = activeQuery.eq("channel_id", channelId);
        const { count: active } = await activeQuery;

        // Get deleted
        let deletedQuery = client
          .from("discord_message")
          .select("*", { count: "exact", head: true })
          .eq("deleted", true);
        if (guildId) deletedQuery = deletedQuery.eq("guild_id", guildId);
        if (channelId) deletedQuery = deletedQuery.eq("channel_id", channelId);
        const { count: deleted } = await deletedQuery;

        // Get edited
        let editedQuery = client
          .from("discord_message")
          .select("*", { count: "exact", head: true })
          .not("edited_at", "is", null);
        if (guildId) editedQuery = editedQuery.eq("guild_id", guildId);
        if (channelId) editedQuery = editedQuery.eq("channel_id", channelId);
        const { count: edited } = await editedQuery;

        return {
          success: true,
          stats: {
            total: total || 0,
            active: active || 0,
            deleted: deleted || 0,
            edited: edited || 0,
          },
        };
      } catch (error) {
        return {
          success: false,
          stats: { total: 0, active: 0, deleted: 0, edited: 0 },
          message: `Error: ${error instanceof Error ? error.message : "Unknown error"}`,
        };
      }
    },
  });

/**
 * Query channel contexts (custom prompts per channel)
 */
export const createQueryChannelContextsTool = (env: Env) =>
  createPrivateTool({
    id: "DISCORD_QUERY_CHANNEL_CONTEXTS",
    description:
      "Query channel contexts (custom system prompts and auto-respond settings) from the database.",
    inputSchema: z
      .object({
        guildId: z.string().describe("Guild ID to query contexts for"),
        channelId: z
          .string()
          .optional()
          .describe("Filter by specific channel ID"),
      })
      .strict(),
    outputSchema: z
      .object({
        success: z.boolean(),
        contexts: z.array(
          z.object({
            guild_id: z.string(),
            channel_id: z.string(),
            channel_name: z.string().nullable(),
            system_prompt: z.string(),
            auto_respond: z.boolean(),
            enabled: z.boolean(),
            created_by_username: z.string(),
            created_at: z.string(),
            updated_at: z.string(),
          }),
        ),
        total: z.number(),
        message: z.string().optional(),
      })
      .strict(),
    execute: async (params: any) => {
      const { context } = params;
      const { guildId, channelId } = context as {
        guildId: string;
        channelId?: string;
      };

      const client = getSupabaseClient();
      if (!client) {
        return {
          success: false,
          contexts: [],
          total: 0,
          message: "Database not configured",
        };
      }

      try {
        let query = client
          .from("discord_channel_context")
          .select("*", { count: "exact" })
          .eq("guild_id", guildId);

        if (channelId) {
          query = query.eq("channel_id", channelId);
        }

        const { data, error, count } = await query.order("channel_name");

        if (error) {
          return {
            success: false,
            contexts: [],
            total: 0,
            message: `Query failed: ${error.message}`,
          };
        }

        return {
          success: true,
          contexts: data || [],
          total: count || 0,
        };
      } catch (error) {
        return {
          success: false,
          contexts: [],
          total: 0,
          message: `Error: ${error instanceof Error ? error.message : "Unknown error"}`,
        };
      }
    },
  });

/**
 * Set channel auto-respond setting
 */
export const createSetChannelAutoRespondTool = (env: Env) =>
  createPrivateTool({
    id: "DISCORD_SET_CHANNEL_AUTO_RESPOND",
    description:
      "Enable or disable auto-respond for a channel. When enabled, the bot will respond to ALL messages in the channel without needing to be mentioned.",
    inputSchema: z
      .object({
        guildId: z.string().describe("Guild ID"),
        channelId: z.string().describe("Channel ID"),
        channelName: z
          .string()
          .optional()
          .describe("Channel name for reference"),
        autoRespond: z
          .boolean()
          .describe("Whether to auto-respond to all messages in this channel"),
        systemPrompt: z
          .string()
          .optional()
          .describe(
            "Custom system prompt for this channel. Required if auto_respond is being enabled for the first time.",
          ),
        createdById: z.string().describe("User ID who is setting this"),
        createdByUsername: z.string().describe("Username who is setting this"),
      })
      .strict(),
    outputSchema: z
      .object({
        success: z.boolean(),
        message: z.string(),
      })
      .strict(),
    execute: async (params: any) => {
      const { context } = params;
      const {
        guildId,
        channelId,
        channelName,
        autoRespond,
        systemPrompt,
        createdById,
        createdByUsername,
      } = context as {
        guildId: string;
        channelId: string;
        channelName?: string;
        autoRespond: boolean;
        systemPrompt?: string;
        createdById: string;
        createdByUsername: string;
      };

      const client = getSupabaseClient();
      if (!client) {
        return {
          success: false,
          message: "Database not configured",
        };
      }

      try {
        // Check if context already exists
        const { data: existing } = await client
          .from("discord_channel_context")
          .select("*")
          .eq("guild_id", guildId)
          .eq("channel_id", channelId)
          .single();

        if (!existing && autoRespond && !systemPrompt) {
          return {
            success: false,
            message:
              "A system prompt is required when enabling auto-respond for a new channel.",
          };
        }

        const row = {
          guild_id: guildId,
          channel_id: channelId,
          channel_name: channelName || existing?.channel_name || null,
          system_prompt:
            systemPrompt ||
            existing?.system_prompt ||
            "You are a helpful assistant.",
          auto_respond: autoRespond,
          enabled: true,
          created_by_id: createdById,
          created_by_username: createdByUsername,
          updated_at: new Date().toISOString(),
        };

        const { error } = await client
          .from("discord_channel_context")
          .upsert(row, { onConflict: "guild_id, channel_id" });

        if (error) {
          return {
            success: false,
            message: `Failed to update: ${error.message}`,
          };
        }

        // Invalidate caches so new setting takes effect immediately
        invalidateChannelContextCache(guildId, channelId);
        invalidateAutoRespondCache(guildId, channelId);

        return {
          success: true,
          message: autoRespond
            ? `Auto-respond ENABLED for channel ${channelName || channelId}. Bot will now respond to ALL messages without needing to be mentioned.`
            : `Auto-respond DISABLED for channel ${channelName || channelId}. Users must mention the bot to get a response.`,
        };
      } catch (error) {
        return {
          success: false,
          message: `Error: ${error instanceof Error ? error.message : "Unknown error"}`,
        };
      }
    },
  });

// Export all database tools
export const databaseTools = [
  createQueryMessagesTool,
  createQueryGuildsTool,
  createMessageStatsTool,
  createQueryChannelContextsTool,
  createSetChannelAutoRespondTool,
];
