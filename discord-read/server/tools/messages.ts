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
  createGuildStatsTool,
];
