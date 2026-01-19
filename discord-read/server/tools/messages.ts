/**
 * Message MCP Tools
 *
 * Tools for querying Discord messages via MCP.
 */

import { createPrivateTool } from "@decocms/runtime/tools";
import { z } from "zod";
import { runSQL } from "../db/postgres.ts";
import type { Env } from "../types/env.ts";

// ============================================================================
// Schemas
// ============================================================================

const MessageSchema = z
  .object({
    id: z.string(),
    guild_id: z.string(),
    channel_id: z.string(),
    channel_name: z.string().nullable(),
    author_id: z.string(),
    author_username: z.string(),
    author_bot: z.boolean(),
    content: z.string().nullable(),
    created_at: z.string(),
  })
  .strict();

type Message = z.infer<typeof MessageSchema>;

// ============================================================================
// Tools
// ============================================================================

/**
 * List messages in a channel
 */
export const createMessageListTool = (env: Env) =>
  createPrivateTool({
    id: "DISCORD_MESSAGE_LIST",
    description: "List messages from a Discord channel",
    inputSchema: z
      .object({
        guild_id: z.string().describe("Discord server/guild ID"),
        channel_id: z.string().describe("Channel ID"),
        limit: z.number().default(50).describe("Max messages to return"),
        offset: z.number().default(0).describe("Offset for pagination"),
      })
      .strict(),
    outputSchema: z
      .object({
        messages: z.array(MessageSchema),
        total: z.number(),
      })
      .strict(),
    execute: async ({ context }: { context: unknown }) => {
      const { guild_id, channel_id, limit, offset } = context as {
        guild_id: string;
        channel_id: string;
        limit: number;
        offset: number;
      };

      const messages = await runSQL<Message>(
        env,
        `SELECT id, guild_id, channel_id, channel_name, author_id, author_username, author_bot, content, created_at
         FROM discord_message 
         WHERE guild_id = $1 AND channel_id = $2
         ORDER BY created_at DESC
         LIMIT $3 OFFSET $4`,
        [guild_id, channel_id, limit, offset],
      );

      return {
        messages,
        total: messages.length,
      };
    },
  });

/**
 * Search messages
 */
export const createMessageSearchTool = (env: Env) =>
  createPrivateTool({
    id: "DISCORD_MESSAGE_SEARCH",
    description: "Search messages by content",
    inputSchema: z
      .object({
        guild_id: z.string().describe("Discord server/guild ID"),
        query: z.string().describe("Search query"),
        channel_id: z.string().optional().describe("Filter by channel"),
        limit: z.number().default(20).describe("Max results"),
      })
      .strict(),
    outputSchema: z
      .object({
        messages: z.array(MessageSchema),
        total: z.number(),
      })
      .strict(),
    execute: async ({ context }: { context: unknown }) => {
      const { guild_id, query, channel_id, limit } = context as {
        guild_id: string;
        query: string;
        channel_id?: string;
        limit: number;
      };

      let sql = `SELECT id, guild_id, channel_id, channel_name, author_id, author_username, author_bot, content, created_at
                 FROM discord_message 
                 WHERE guild_id = $1 AND content ILIKE $2`;
      const params: unknown[] = [guild_id, `%${query}%`];

      if (channel_id) {
        sql += ` AND channel_id = $3`;
        params.push(channel_id);
      }

      sql += ` ORDER BY created_at DESC LIMIT $${params.length + 1}`;
      params.push(limit);

      const messages = await runSQL<Message>(env, sql, params);

      return {
        messages,
        total: messages.length,
      };
    },
  });

/**
 * Get messages from a specific user (across all channels)
 */
export const createGetUserMessagesTool = (env: Env) =>
  createPrivateTool({
    id: "DISCORD_GET_USER_MESSAGES",
    description:
      "Get messages from a specific user across ALL channels in a server. " +
      "Useful for moderation, checking user activity, or finding specific user content.",
    inputSchema: z
      .object({
        guild_id: z.string().describe("Discord server/guild ID"),
        user_id: z.string().describe("User ID to search messages for"),
        limit: z
          .number()
          .min(1)
          .max(100)
          .default(10)
          .describe("Max messages to return (1-100)"),
        channel_id: z
          .string()
          .optional()
          .describe("Optional: filter to a specific channel"),
        content_filter: z
          .string()
          .optional()
          .describe("Optional: filter messages containing this text"),
        include_deleted: z
          .boolean()
          .default(false)
          .describe("Include deleted messages"),
        before_date: z
          .string()
          .optional()
          .describe("Filter messages before this date (ISO8601)"),
        after_date: z
          .string()
          .optional()
          .describe("Filter messages after this date (ISO8601)"),
      })
      .strict(),
    outputSchema: z
      .object({
        user_id: z.string(),
        messages: z.array(
          z.object({
            id: z.string(),
            channel_id: z.string(),
            channel_name: z.string().nullable(),
            content: z.string().nullable(),
            created_at: z.string(),
            deleted: z.boolean().optional(),
            edited_at: z.string().nullable().optional(),
          }),
        ),
        total_found: z.number(),
        channels_active: z.number(),
      })
      .strict(),
    execute: async ({ context }: { context: unknown }) => {
      const input = context as {
        guild_id: string;
        user_id: string;
        limit: number;
        channel_id?: string;
        content_filter?: string;
        include_deleted: boolean;
        before_date?: string;
        after_date?: string;
      };

      // Build dynamic query
      let sql = `
        SELECT id, channel_id, channel_name, content, created_at, deleted, edited_at
        FROM discord_message 
        WHERE guild_id = $1 AND author_id = $2
      `;
      const params: unknown[] = [input.guild_id, input.user_id];
      let paramIndex = 3;

      // Optional filters
      if (!input.include_deleted) {
        sql += ` AND (deleted = false OR deleted IS NULL)`;
      }

      if (input.channel_id) {
        sql += ` AND channel_id = $${paramIndex}`;
        params.push(input.channel_id);
        paramIndex++;
      }

      if (input.content_filter) {
        sql += ` AND content ILIKE $${paramIndex}`;
        params.push(`%${input.content_filter}%`);
        paramIndex++;
      }

      if (input.before_date) {
        sql += ` AND created_at < $${paramIndex}`;
        params.push(input.before_date);
        paramIndex++;
      }

      if (input.after_date) {
        sql += ` AND created_at > $${paramIndex}`;
        params.push(input.after_date);
        paramIndex++;
      }

      sql += ` ORDER BY created_at DESC LIMIT $${paramIndex}`;
      params.push(input.limit);

      const messages = await runSQL<{
        id: string;
        channel_id: string;
        channel_name: string | null;
        content: string | null;
        created_at: string;
        deleted?: boolean;
        edited_at?: string | null;
      }>(env, sql, params);

      // Count unique channels
      const uniqueChannels = new Set(messages.map((m) => m.channel_id));

      return {
        user_id: input.user_id,
        messages: messages.map((m) => ({
          id: m.id,
          channel_id: m.channel_id,
          channel_name: m.channel_name,
          content: m.content,
          created_at: m.created_at,
          deleted: m.deleted,
          edited_at: m.edited_at,
        })),
        total_found: messages.length,
        channels_active: uniqueChannels.size,
      };
    },
  });

/**
 * Get user activity stats
 */
export const createGetUserStatsTool = (env: Env) =>
  createPrivateTool({
    id: "DISCORD_GET_USER_STATS",
    description:
      "Get activity statistics for a specific user in a server. " +
      "Shows message count per channel, most active times, etc.",
    inputSchema: z
      .object({
        guild_id: z.string().describe("Discord server/guild ID"),
        user_id: z.string().describe("User ID to get stats for"),
        days: z
          .number()
          .min(1)
          .max(365)
          .default(30)
          .describe("Number of days to analyze (1-365)"),
      })
      .strict(),
    outputSchema: z
      .object({
        user_id: z.string(),
        period_days: z.number(),
        total_messages: z.number(),
        deleted_messages: z.number(),
        edited_messages: z.number(),
        channels: z.array(
          z.object({
            channel_id: z.string(),
            channel_name: z.string().nullable(),
            message_count: z.number(),
          }),
        ),
        first_message_date: z.string().nullable(),
        last_message_date: z.string().nullable(),
      })
      .strict(),
    execute: async ({ context }: { context: unknown }) => {
      const input = context as {
        guild_id: string;
        user_id: string;
        days: number;
      };

      const sinceDate = new Date();
      sinceDate.setDate(sinceDate.getDate() - input.days);
      const sinceDateStr = sinceDate.toISOString();

      // Get total messages
      const [totalResult] = await runSQL<{ count: string }>(
        env,
        `SELECT COUNT(*) as count FROM discord_message 
         WHERE guild_id = $1 AND author_id = $2 AND created_at > $3`,
        [input.guild_id, input.user_id, sinceDateStr],
      );

      // Get deleted messages
      const [deletedResult] = await runSQL<{ count: string }>(
        env,
        `SELECT COUNT(*) as count FROM discord_message 
         WHERE guild_id = $1 AND author_id = $2 AND created_at > $3 AND deleted = true`,
        [input.guild_id, input.user_id, sinceDateStr],
      );

      // Get edited messages
      const [editedResult] = await runSQL<{ count: string }>(
        env,
        `SELECT COUNT(*) as count FROM discord_message 
         WHERE guild_id = $1 AND author_id = $2 AND created_at > $3 AND edited_at IS NOT NULL`,
        [input.guild_id, input.user_id, sinceDateStr],
      );

      // Get messages per channel
      const channelStats = await runSQL<{
        channel_id: string;
        channel_name: string | null;
        message_count: string;
      }>(
        env,
        `SELECT channel_id, channel_name, COUNT(*) as message_count
         FROM discord_message 
         WHERE guild_id = $1 AND author_id = $2 AND created_at > $3
         GROUP BY channel_id, channel_name
         ORDER BY message_count DESC
         LIMIT 20`,
        [input.guild_id, input.user_id, sinceDateStr],
      );

      // Get first and last message dates
      const [dateRange] = await runSQL<{
        first_date: string | null;
        last_date: string | null;
      }>(
        env,
        `SELECT MIN(created_at) as first_date, MAX(created_at) as last_date
         FROM discord_message 
         WHERE guild_id = $1 AND author_id = $2`,
        [input.guild_id, input.user_id],
      );

      return {
        user_id: input.user_id,
        period_days: input.days,
        total_messages: parseInt(totalResult?.count || "0"),
        deleted_messages: parseInt(deletedResult?.count || "0"),
        edited_messages: parseInt(editedResult?.count || "0"),
        channels: channelStats.map((c) => ({
          channel_id: c.channel_id,
          channel_name: c.channel_name,
          message_count: parseInt(c.message_count),
        })),
        first_message_date: dateRange?.first_date || null,
        last_message_date: dateRange?.last_date || null,
      };
    },
  });

/**
 * Get guild stats
 */
export const createGuildStatsTool = (env: Env) =>
  createPrivateTool({
    id: "DISCORD_GUILD_STATS",
    description: "Get statistics for a Discord server",
    inputSchema: z
      .object({
        guild_id: z.string().describe("Discord server/guild ID"),
      })
      .strict(),
    outputSchema: z
      .object({
        total_messages: z.number(),
        total_reactions: z.number(),
        total_agents: z.number(),
      })
      .strict(),
    execute: async ({ context }: { context: unknown }) => {
      const { guild_id } = context as { guild_id: string };

      const [messagesResult] = await runSQL<{ count: string }>(
        env,
        `SELECT COUNT(*) as count FROM discord_message WHERE guild_id = $1`,
        [guild_id],
      );

      const [reactionsResult] = await runSQL<{ count: string }>(
        env,
        `SELECT COUNT(*) as count FROM discord_message_reaction r
         JOIN discord_message m ON r.message_id = m.id
         WHERE m.guild_id = $1`,
        [guild_id],
      );

      const [agentsResult] = await runSQL<{ count: string }>(
        env,
        `SELECT COUNT(*) as count FROM discord_agent_config WHERE guild_id = $1`,
        [guild_id],
      );

      return {
        total_messages: parseInt(messagesResult?.count || "0"),
        total_reactions: parseInt(reactionsResult?.count || "0"),
        total_agents: parseInt(agentsResult?.count || "0"),
      };
    },
  });

// ============================================================================
// Export
// ============================================================================

export const messageTools = [
  createMessageListTool,
  createMessageSearchTool,
  createGetUserMessagesTool,
  createGetUserStatsTool,
  createGuildStatsTool,
];
