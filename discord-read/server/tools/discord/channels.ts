/**
 * Discord Channel Tools
 *
 * Tools for managing channels and threads.
 */

import { createTool } from "@decocms/runtime/tools";
import z from "zod";
import type { Env } from "../../types/env.ts";
import { discordAPI } from "./api.ts";

// Channel types enum
const ChannelType = {
  GUILD_TEXT: 0,
  DM: 1,
  GUILD_VOICE: 2,
  GROUP_DM: 3,
  GUILD_CATEGORY: 4,
  GUILD_ANNOUNCEMENT: 5,
  ANNOUNCEMENT_THREAD: 10,
  PUBLIC_THREAD: 11,
  PRIVATE_THREAD: 12,
  GUILD_STAGE_VOICE: 13,
  GUILD_DIRECTORY: 14,
  GUILD_FORUM: 15,
  GUILD_MEDIA: 16,
};

// ============================================================================
// List Guild Channels
// ============================================================================

export const createListGuildChannelsTool = (env: Env) =>
  createTool({
    id: "DISCORD_LIST_CHANNELS",
    description: "List all channels from a Discord guild",
    annotations: { readOnlyHint: true },
    inputSchema: z
      .object({
        guild_id: z.string().describe("The guild ID"),
      })
      .strict(),
    outputSchema: z
      .object({
        channels: z.array(
          z.object({
            id: z.string(),
            name: z.string(),
            type: z.number(),
            type_name: z.string(),
            parent_id: z.string().nullable(),
            position: z.number(),
          }),
        ),
        count: z.number(),
      })
      .strict(),
    execute: async ({ context }: { context: unknown }) => {
      const input = context as { guild_id: string };

      const channels = await discordAPI<
        Array<{
          id: string;
          name: string;
          type: number;
          parent_id: string | null;
          position: number;
        }>
      >(env, `/guilds/${input.guild_id}/channels`);

      const typeNames: Record<number, string> = {
        0: "text",
        2: "voice",
        4: "category",
        5: "announcement",
        13: "stage",
        15: "forum",
        16: "media",
      };

      return {
        channels: channels.map((c) => ({
          id: c.id,
          name: c.name,
          type: c.type,
          type_name: typeNames[c.type] || "unknown",
          parent_id: c.parent_id,
          position: c.position,
        })),
        count: channels.length,
      };
    },
  });

// ============================================================================
// Create Channel
// ============================================================================

export const createCreateChannelTool = (env: Env) =>
  createTool({
    id: "DISCORD_CREATE_CHANNEL",
    description: "Create a new channel in a Discord guild",
    annotations: { destructiveHint: false, openWorldHint: true },
    inputSchema: z
      .object({
        guild_id: z.string().describe("The guild ID"),
        name: z.string().describe("Channel name (1-100 characters)"),
        type: z
          .enum(["text", "voice", "category", "announcement", "stage", "forum"])
          .default("text")
          .describe("Channel type"),
        topic: z
          .string()
          .optional()
          .describe("Channel topic (0-1024 characters)"),
        parent_id: z.string().optional().describe("Category ID to nest under"),
        nsfw: z.boolean().optional().describe("Whether the channel is NSFW"),
        position: z.number().optional().describe("Sorting position"),
        reason: z
          .string()
          .optional()
          .describe("Reason for creation (audit log)"),
      })
      .strict(),
    outputSchema: z
      .object({
        id: z.string(),
        name: z.string(),
        type: z.number(),
        guild_id: z.string(),
      })
      .strict(),
    execute: async ({ context }: { context: unknown }) => {
      const input = context as {
        guild_id: string;
        name: string;
        type: string;
        topic?: string;
        parent_id?: string;
        nsfw?: boolean;
        position?: number;
        reason?: string;
      };

      const typeMap: Record<string, number> = {
        text: ChannelType.GUILD_TEXT,
        voice: ChannelType.GUILD_VOICE,
        category: ChannelType.GUILD_CATEGORY,
        announcement: ChannelType.GUILD_ANNOUNCEMENT,
        stage: ChannelType.GUILD_STAGE_VOICE,
        forum: ChannelType.GUILD_FORUM,
      };

      const body: Record<string, unknown> = {
        name: input.name,
        type: typeMap[input.type] ?? ChannelType.GUILD_TEXT,
      };

      if (input.topic) body.topic = input.topic;
      if (input.parent_id) body.parent_id = input.parent_id;
      if (input.nsfw !== undefined) body.nsfw = input.nsfw;
      if (input.position !== undefined) body.position = input.position;

      const result = await discordAPI<{
        id: string;
        name: string;
        type: number;
        guild_id: string;
      }>(env, `/guilds/${input.guild_id}/channels`, {
        method: "POST",
        body,
        reason: input.reason,
      });

      return result;
    },
  });

// ============================================================================
// Create Thread
// ============================================================================

export const createCreateThreadTool = (env: Env) =>
  createTool({
    id: "DISCORD_CREATE_THREAD",
    description: "Create a thread or forum post in a Discord channel",
    annotations: { destructiveHint: false, openWorldHint: true },
    inputSchema: z
      .object({
        channel_id: z
          .string()
          .describe("The channel ID (text channel or forum)"),
        name: z.string().describe("Thread name (1-100 characters)"),
        message_id: z
          .string()
          .optional()
          .describe("Message ID to create thread from (for text channels)"),
        auto_archive_duration: z
          .enum(["60", "1440", "4320", "10080"])
          .optional()
          .describe("Minutes until auto-archive (60, 1440, 4320, 10080)"),
        type: z
          .enum(["public", "private"])
          .default("public")
          .describe("Thread type (public or private)"),
        content: z
          .string()
          .optional()
          .describe("Initial message content (for forum posts)"),
        reason: z.string().optional().describe("Reason (audit log)"),
      })
      .strict(),
    outputSchema: z
      .object({
        id: z.string(),
        name: z.string(),
        parent_id: z.string(),
        type: z.number(),
      })
      .strict(),
    execute: async ({ context }: { context: unknown }) => {
      const input = context as {
        channel_id: string;
        name: string;
        message_id?: string;
        auto_archive_duration?: string;
        type: string;
        content?: string;
        reason?: string;
      };

      let endpoint: string;
      const body: Record<string, unknown> = { name: input.name };

      if (input.auto_archive_duration) {
        body.auto_archive_duration = parseInt(input.auto_archive_duration, 10);
      }

      if (input.message_id) {
        // Create thread from message
        endpoint = `/channels/${input.channel_id}/messages/${input.message_id}/threads`;
      } else if (input.content) {
        // Forum post with initial message
        endpoint = `/channels/${input.channel_id}/threads`;
        body.message = { content: input.content };
      } else {
        // Thread without message
        endpoint = `/channels/${input.channel_id}/threads`;
        body.type =
          input.type === "private"
            ? ChannelType.PRIVATE_THREAD
            : ChannelType.PUBLIC_THREAD;
      }

      const result = await discordAPI<{
        id: string;
        name: string;
        parent_id: string;
        type: number;
      }>(env, endpoint, {
        method: "POST",
        body,
        reason: input.reason,
      });

      return result;
    },
  });

// ============================================================================
// Get Active Threads
// ============================================================================

export const createGetActiveThreadsTool = (env: Env) =>
  createTool({
    id: "DISCORD_GET_ACTIVE_THREADS",
    description:
      "Get all active threads in a Discord server (includes forum posts)",
    annotations: { readOnlyHint: true },
    inputSchema: z
      .object({
        guild_id: z.string().describe("The guild ID"),
      })
      .strict(),
    outputSchema: z
      .object({
        threads: z.array(
          z.object({
            id: z.string(),
            name: z.string(),
            parent_id: z.string(),
            type: z.number(),
            message_count: z.number().optional(),
            member_count: z.number().optional(),
          }),
        ),
        count: z.number(),
      })
      .strict(),
    execute: async ({ context }: { context: unknown }) => {
      const input = context as { guild_id: string };

      const result = await discordAPI<{
        threads: Array<{
          id: string;
          name: string;
          parent_id: string;
          type: number;
          message_count?: number;
          member_count?: number;
        }>;
      }>(env, `/guilds/${input.guild_id}/threads/active`);

      return {
        threads: result.threads.map((t) => ({
          id: t.id,
          name: t.name,
          parent_id: t.parent_id,
          type: t.type,
          message_count: t.message_count,
          member_count: t.member_count,
        })),
        count: result.threads.length,
      };
    },
  });

// ============================================================================
// Get Archived Threads
// ============================================================================

export const createGetArchivedThreadsTool = (env: Env) =>
  createTool({
    id: "DISCORD_GET_ARCHIVED_THREADS",
    description: "Get archived threads from a Discord channel",
    annotations: { readOnlyHint: true },
    inputSchema: z
      .object({
        channel_id: z.string().describe("The channel ID"),
        type: z
          .enum(["public", "private"])
          .default("public")
          .describe("Thread type"),
        limit: z.number().min(1).max(100).default(50).describe("Max threads"),
        before: z.string().optional().describe("ISO8601 timestamp"),
      })
      .strict(),
    outputSchema: z
      .object({
        threads: z.array(
          z.object({
            id: z.string(),
            name: z.string(),
            archived: z.boolean(),
            archive_timestamp: z.string().optional(),
          }),
        ),
        has_more: z.boolean(),
      })
      .strict(),
    execute: async ({ context }: { context: unknown }) => {
      const input = context as {
        channel_id: string;
        type: string;
        limit: number;
        before?: string;
      };

      const params = new URLSearchParams();
      params.set("limit", String(input.limit));
      if (input.before) params.set("before", input.before);

      const endpoint =
        input.type === "private"
          ? `/channels/${input.channel_id}/threads/archived/private`
          : `/channels/${input.channel_id}/threads/archived/public`;

      const result = await discordAPI<{
        threads: Array<{
          id: string;
          name: string;
          thread_metadata: { archived: boolean; archive_timestamp?: string };
        }>;
        has_more: boolean;
      }>(env, `${endpoint}?${params.toString()}`);

      return {
        threads: result.threads.map((t) => ({
          id: t.id,
          name: t.name,
          archived: t.thread_metadata.archived,
          archive_timestamp: t.thread_metadata.archive_timestamp,
        })),
        has_more: result.has_more,
      };
    },
  });

// ============================================================================
// Join/Leave Thread
// ============================================================================

export const createJoinThreadTool = (env: Env) =>
  createTool({
    id: "DISCORD_JOIN_THREAD",
    description: "Join a thread with the bot",
    annotations: { destructiveHint: false, openWorldHint: true },
    inputSchema: z
      .object({
        thread_id: z.string().describe("The thread ID to join"),
      })
      .strict(),
    outputSchema: z.object({ success: z.boolean() }).strict(),
    execute: async ({ context }: { context: unknown }) => {
      const input = context as { thread_id: string };

      await discordAPI(env, `/channels/${input.thread_id}/thread-members/@me`, {
        method: "PUT",
      });

      return { success: true };
    },
  });

export const createLeaveThreadTool = (env: Env) =>
  createTool({
    id: "DISCORD_LEAVE_THREAD",
    description: "Leave a thread with the bot",
    annotations: { destructiveHint: false, openWorldHint: true },
    inputSchema: z
      .object({
        thread_id: z.string().describe("The thread ID to leave"),
      })
      .strict(),
    outputSchema: z.object({ success: z.boolean() }).strict(),
    execute: async ({ context }: { context: unknown }) => {
      const input = context as { thread_id: string };

      await discordAPI(env, `/channels/${input.thread_id}/thread-members/@me`, {
        method: "DELETE",
      });

      return { success: true };
    },
  });

// ============================================================================
// Edit Thread
// ============================================================================

export const createEditThreadTool = (env: Env) =>
  createTool({
    id: "DISCORD_EDIT_THREAD",
    description:
      "Edit a thread or forum post — change name, archive status, or applied tags (for forum posts, use applied_tags to add/remove tags like 'Solved')",
    annotations: { destructiveHint: false, openWorldHint: true },
    inputSchema: z
      .object({
        thread_id: z.string().describe("The thread/forum post ID to edit"),
        name: z
          .string()
          .optional()
          .describe("New thread name (1-100 characters)"),
        archived: z
          .boolean()
          .optional()
          .describe("Whether to archive the thread"),
        locked: z.boolean().optional().describe("Whether to lock the thread"),
        applied_tags: z
          .array(z.string())
          .optional()
          .describe(
            "Tag IDs to apply (forum posts only). Replaces all current tags. Max 5.",
          ),
        auto_archive_duration: z
          .enum(["60", "1440", "4320", "10080"])
          .optional()
          .describe("Minutes until auto-archive"),
        reason: z.string().optional().describe("Reason (audit log)"),
      })
      .strict(),
    outputSchema: z
      .object({
        id: z.string(),
        name: z.string(),
        archived: z.boolean(),
        locked: z.boolean(),
        applied_tags: z.array(z.string()).optional(),
      })
      .strict(),
    execute: async ({ context }: { context: unknown }) => {
      const input = context as {
        thread_id: string;
        name?: string;
        archived?: boolean;
        locked?: boolean;
        applied_tags?: string[];
        auto_archive_duration?: string;
        reason?: string;
      };

      const body: Record<string, unknown> = {};
      if (input.name !== undefined) body.name = input.name;
      if (input.archived !== undefined) body.archived = input.archived;
      if (input.locked !== undefined) body.locked = input.locked;
      if (input.applied_tags !== undefined)
        body.applied_tags = input.applied_tags;
      if (input.auto_archive_duration !== undefined)
        body.auto_archive_duration = parseInt(input.auto_archive_duration, 10);

      const result = await discordAPI<{
        id: string;
        name: string;
        thread_metadata: { archived: boolean; locked: boolean };
        applied_tags?: string[];
      }>(env, `/channels/${input.thread_id}`, {
        method: "PATCH",
        body,
        reason: input.reason,
      });

      return {
        id: result.id,
        name: result.name,
        archived: result.thread_metadata?.archived ?? false,
        locked: result.thread_metadata?.locked ?? false,
        applied_tags: result.applied_tags,
      };
    },
  });

// ============================================================================
// Get Forum Tags
// ============================================================================

export const createGetForumTagsTool = (env: Env) =>
  createTool({
    id: "DISCORD_GET_FORUM_TAGS",
    description:
      "Get available tags from a forum channel. Use this to find tag IDs (e.g. 'Solved') before applying them with DISCORD_EDIT_THREAD.",
    annotations: { readOnlyHint: true },
    inputSchema: z
      .object({
        channel_id: z.string().describe("The forum channel ID"),
      })
      .strict(),
    outputSchema: z
      .object({
        tags: z.array(
          z.object({
            id: z.string(),
            name: z.string(),
            moderated: z.boolean(),
            emoji_id: z.string().nullable(),
            emoji_name: z.string().nullable(),
          }),
        ),
        channel_name: z.string(),
      })
      .strict(),
    execute: async ({ context }: { context: unknown }) => {
      const input = context as { channel_id: string };

      const channel = await discordAPI<{
        id: string;
        name: string;
        available_tags?: Array<{
          id: string;
          name: string;
          moderated: boolean;
          emoji_id: string | null;
          emoji_name: string | null;
        }>;
      }>(env, `/channels/${input.channel_id}`);

      return {
        tags: (channel.available_tags ?? []).map((t) => ({
          id: t.id,
          name: t.name,
          moderated: t.moderated,
          emoji_id: t.emoji_id,
          emoji_name: t.emoji_name,
        })),
        channel_name: channel.name,
      };
    },
  });

// ============================================================================
// Export
// ============================================================================

export const discordChannelTools = [
  createListGuildChannelsTool,
  createCreateChannelTool,
  createCreateThreadTool,
  createEditThreadTool,
  createGetActiveThreadsTool,
  createGetArchivedThreadsTool,
  createGetForumTagsTool,
  createJoinThreadTool,
  createLeaveThreadTool,
];
