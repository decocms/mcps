/**
 * Discord Message Tools
 *
 * Tools for sending, editing, deleting, and managing messages.
 */

import { createPrivateTool } from "@decocms/runtime/tools";
import z from "zod";
import type { Env } from "../../types/env.ts";
import { discordAPI, encodeEmoji } from "./api.ts";

// ============================================================================
// Send Message
// ============================================================================

export const createSendMessageTool = (env: Env) =>
  createPrivateTool({
    id: "DISCORD_SEND_MESSAGE",
    description: "Send a message to a Discord channel",
    inputSchema: z
      .object({
        channel_id: z
          .string()
          .describe("The channel ID to send the message to"),
        content: z
          .string()
          .optional()
          .describe("The message content (up to 2000 characters)"),
        embeds: z
          .array(
            z.object({
              title: z.string().optional(),
              description: z.string().optional(),
              url: z.string().optional(),
              color: z.number().optional(),
              footer: z.object({ text: z.string() }).optional(),
              thumbnail: z.object({ url: z.string() }).optional(),
              image: z.object({ url: z.string() }).optional(),
              fields: z
                .array(
                  z.object({
                    name: z.string(),
                    value: z.string(),
                    inline: z.boolean().optional(),
                  }),
                )
                .optional(),
            }),
          )
          .optional()
          .describe("Array of embed objects"),
        reply_to: z.string().optional().describe("Message ID to reply to"),
        tts: z.boolean().optional().describe("Whether this is a TTS message"),
      })
      .strict(),
    outputSchema: z
      .object({
        id: z.string(),
        channel_id: z.string(),
        content: z.string(),
        timestamp: z.string(),
      })
      .strict(),
    execute: async ({ context }: { context: unknown }) => {
      const input = context as {
        channel_id: string;
        content?: string;
        embeds?: unknown[];
        reply_to?: string;
        tts?: boolean;
      };

      const body: Record<string, unknown> = {};
      if (input.content) body.content = input.content;
      if (input.embeds) body.embeds = input.embeds;
      if (input.tts) body.tts = input.tts;
      if (input.reply_to) {
        body.message_reference = { message_id: input.reply_to };
      }

      const result = await discordAPI<{
        id: string;
        channel_id: string;
        content: string;
        timestamp: string;
      }>(env, `/channels/${input.channel_id}/messages`, {
        method: "POST",
        body,
      });

      return {
        id: result.id,
        channel_id: result.channel_id,
        content: result.content,
        timestamp: result.timestamp,
      };
    },
  });

// ============================================================================
// Edit Message
// ============================================================================

export const createEditMessageTool = (env: Env) =>
  createPrivateTool({
    id: "DISCORD_EDIT_MESSAGE",
    description: "Edit a message in a Discord channel",
    inputSchema: z
      .object({
        channel_id: z.string().describe("The channel ID"),
        message_id: z.string().describe("The message ID to edit"),
        content: z.string().optional().describe("The new message content"),
        embeds: z
          .array(z.object({}).passthrough())
          .optional()
          .describe("New embeds"),
      })
      .strict(),
    outputSchema: z
      .object({
        id: z.string(),
        content: z.string(),
        edited_timestamp: z.string().nullable(),
      })
      .strict(),
    execute: async ({ context }: { context: unknown }) => {
      const input = context as {
        channel_id: string;
        message_id: string;
        content?: string;
        embeds?: unknown[];
      };

      const body: Record<string, unknown> = {};
      if (input.content !== undefined) body.content = input.content;
      if (input.embeds) body.embeds = input.embeds;

      const result = await discordAPI<{
        id: string;
        content: string;
        edited_timestamp: string | null;
      }>(env, `/channels/${input.channel_id}/messages/${input.message_id}`, {
        method: "PATCH",
        body,
      });

      return {
        id: result.id,
        content: result.content,
        edited_timestamp: result.edited_timestamp,
      };
    },
  });

// ============================================================================
// Delete Message
// ============================================================================

export const createDeleteMessageTool = (env: Env) =>
  createPrivateTool({
    id: "DISCORD_DELETE_MESSAGE",
    description: "Delete a message from a Discord channel",
    inputSchema: z
      .object({
        channel_id: z.string().describe("The channel ID"),
        message_id: z.string().describe("The message ID to delete"),
        reason: z
          .string()
          .optional()
          .describe("Reason for deletion (audit log)"),
      })
      .strict(),
    outputSchema: z.object({ success: z.boolean() }).strict(),
    execute: async ({ context }: { context: unknown }) => {
      const input = context as {
        channel_id: string;
        message_id: string;
        reason?: string;
      };

      await discordAPI(
        env,
        `/channels/${input.channel_id}/messages/${input.message_id}`,
        {
          method: "DELETE",
          reason: input.reason,
        },
      );

      return { success: true };
    },
  });

// ============================================================================
// Get Message
// ============================================================================

export const createGetMessageTool = (env: Env) =>
  createPrivateTool({
    id: "DISCORD_GET_MESSAGE",
    description: "Get a specific message from a Discord channel",
    inputSchema: z
      .object({
        channel_id: z.string().describe("The channel ID"),
        message_id: z.string().describe("The message ID"),
      })
      .strict(),
    outputSchema: z
      .object({
        id: z.string(),
        channel_id: z.string(),
        content: z.string(),
        author: z.object({
          id: z.string(),
          username: z.string(),
          bot: z.boolean().optional(),
        }),
        timestamp: z.string(),
        edited_timestamp: z.string().nullable(),
        attachments: z.array(z.object({}).passthrough()),
        embeds: z.array(z.object({}).passthrough()),
      })
      .strict(),
    execute: async ({ context }: { context: unknown }) => {
      const input = context as { channel_id: string; message_id: string };

      const result = await discordAPI<{
        id: string;
        channel_id: string;
        content: string;
        author: { id: string; username: string; bot?: boolean };
        timestamp: string;
        edited_timestamp: string | null;
        attachments: unknown[];
        embeds: unknown[];
      }>(env, `/channels/${input.channel_id}/messages/${input.message_id}`);

      return result;
    },
  });

// ============================================================================
// Get Channel Messages
// ============================================================================

export const createGetChannelMessagesTool = (env: Env) =>
  createPrivateTool({
    id: "DISCORD_GET_CHANNEL_MESSAGES",
    description: "Get messages from a Discord channel",
    inputSchema: z
      .object({
        channel_id: z.string().describe("The channel ID"),
        limit: z
          .number()
          .min(1)
          .max(100)
          .default(50)
          .describe("Number of messages (1-100)"),
        before: z
          .string()
          .optional()
          .describe("Get messages before this message ID"),
        after: z
          .string()
          .optional()
          .describe("Get messages after this message ID"),
        around: z
          .string()
          .optional()
          .describe("Get messages around this message ID"),
      })
      .strict(),
    outputSchema: z
      .object({
        messages: z.array(
          z.object({
            id: z.string(),
            content: z.string(),
            author: z.object({
              id: z.string(),
              username: z.string(),
            }),
            timestamp: z.string(),
          }),
        ),
        count: z.number(),
      })
      .strict(),
    execute: async ({ context }: { context: unknown }) => {
      const input = context as {
        channel_id: string;
        limit: number;
        before?: string;
        after?: string;
        around?: string;
      };

      const params = new URLSearchParams();
      params.set("limit", String(input.limit));
      if (input.before) params.set("before", input.before);
      if (input.after) params.set("after", input.after);
      if (input.around) params.set("around", input.around);

      const messages = await discordAPI<
        Array<{
          id: string;
          content: string;
          author: { id: string; username: string };
          timestamp: string;
        }>
      >(env, `/channels/${input.channel_id}/messages?${params.toString()}`);

      return {
        messages: messages.map((m) => ({
          id: m.id,
          content: m.content,
          author: { id: m.author.id, username: m.author.username },
          timestamp: m.timestamp,
        })),
        count: messages.length,
      };
    },
  });

// ============================================================================
// Pin/Unpin Message
// ============================================================================

export const createPinMessageTool = (env: Env) =>
  createPrivateTool({
    id: "DISCORD_PIN_MESSAGE",
    description: "Pin a message in a Discord channel",
    inputSchema: z
      .object({
        channel_id: z.string().describe("The channel ID"),
        message_id: z.string().describe("The message ID to pin"),
        reason: z
          .string()
          .optional()
          .describe("Reason for pinning (audit log)"),
      })
      .strict(),
    outputSchema: z.object({ success: z.boolean() }).strict(),
    execute: async ({ context }: { context: unknown }) => {
      const input = context as {
        channel_id: string;
        message_id: string;
        reason?: string;
      };

      await discordAPI(
        env,
        `/channels/${input.channel_id}/pins/${input.message_id}`,
        { method: "PUT", reason: input.reason },
      );

      return { success: true };
    },
  });

export const createUnpinMessageTool = (env: Env) =>
  createPrivateTool({
    id: "DISCORD_UNPIN_MESSAGE",
    description: "Unpin a message in a Discord channel",
    inputSchema: z
      .object({
        channel_id: z.string().describe("The channel ID"),
        message_id: z.string().describe("The message ID to unpin"),
        reason: z
          .string()
          .optional()
          .describe("Reason for unpinning (audit log)"),
      })
      .strict(),
    outputSchema: z.object({ success: z.boolean() }).strict(),
    execute: async ({ context }: { context: unknown }) => {
      const input = context as {
        channel_id: string;
        message_id: string;
        reason?: string;
      };

      await discordAPI(
        env,
        `/channels/${input.channel_id}/pins/${input.message_id}`,
        { method: "DELETE", reason: input.reason },
      );

      return { success: true };
    },
  });

export const createGetPinnedMessagesTool = (env: Env) =>
  createPrivateTool({
    id: "DISCORD_GET_PINNED_MESSAGES",
    description: "Get all pinned messages from a Discord channel",
    inputSchema: z
      .object({
        channel_id: z.string().describe("The channel ID"),
      })
      .strict(),
    outputSchema: z
      .object({
        messages: z.array(
          z.object({
            id: z.string(),
            content: z.string(),
            author: z.object({ id: z.string(), username: z.string() }),
            timestamp: z.string(),
          }),
        ),
        count: z.number(),
      })
      .strict(),
    execute: async ({ context }: { context: unknown }) => {
      const input = context as { channel_id: string };

      const messages = await discordAPI<
        Array<{
          id: string;
          content: string;
          author: { id: string; username: string };
          timestamp: string;
        }>
      >(env, `/channels/${input.channel_id}/pins`);

      return {
        messages: messages.map((m) => ({
          id: m.id,
          content: m.content,
          author: { id: m.author.id, username: m.author.username },
          timestamp: m.timestamp,
        })),
        count: messages.length,
      };
    },
  });

// ============================================================================
// Reactions
// ============================================================================

export const createAddReactionTool = (env: Env) =>
  createPrivateTool({
    id: "DISCORD_ADD_REACTION",
    description: "Add an emoji reaction to a Discord message",
    inputSchema: z
      .object({
        channel_id: z.string().describe("The channel ID"),
        message_id: z.string().describe("The message ID"),
        emoji: z
          .string()
          .describe(
            "The emoji (Unicode emoji or custom emoji in format name:id)",
          ),
      })
      .strict(),
    outputSchema: z.object({ success: z.boolean() }).strict(),
    execute: async ({ context }: { context: unknown }) => {
      const input = context as {
        channel_id: string;
        message_id: string;
        emoji: string;
      };

      await discordAPI(
        env,
        `/channels/${input.channel_id}/messages/${input.message_id}/reactions/${encodeEmoji(input.emoji)}/@me`,
        { method: "PUT" },
      );

      return { success: true };
    },
  });

export const createRemoveReactionTool = (env: Env) =>
  createPrivateTool({
    id: "DISCORD_REMOVE_REACTION",
    description: "Remove bot's reaction from a message",
    inputSchema: z
      .object({
        channel_id: z.string().describe("The channel ID"),
        message_id: z.string().describe("The message ID"),
        emoji: z.string().describe("The emoji to remove"),
      })
      .strict(),
    outputSchema: z.object({ success: z.boolean() }).strict(),
    execute: async ({ context }: { context: unknown }) => {
      const input = context as {
        channel_id: string;
        message_id: string;
        emoji: string;
      };

      await discordAPI(
        env,
        `/channels/${input.channel_id}/messages/${input.message_id}/reactions/${encodeEmoji(input.emoji)}/@me`,
        { method: "DELETE" },
      );

      return { success: true };
    },
  });

export const createGetReactionsTool = (env: Env) =>
  createPrivateTool({
    id: "DISCORD_GET_REACTIONS",
    description: "Get users who reacted to a message with a specific emoji",
    inputSchema: z
      .object({
        channel_id: z.string().describe("The channel ID"),
        message_id: z.string().describe("The message ID"),
        emoji: z.string().describe("The emoji"),
        limit: z
          .number()
          .min(1)
          .max(100)
          .default(25)
          .describe("Max users to return"),
      })
      .strict(),
    outputSchema: z
      .object({
        users: z.array(
          z.object({
            id: z.string(),
            username: z.string(),
            bot: z.boolean().optional(),
          }),
        ),
        count: z.number(),
      })
      .strict(),
    execute: async ({ context }: { context: unknown }) => {
      const input = context as {
        channel_id: string;
        message_id: string;
        emoji: string;
        limit: number;
      };

      const users = await discordAPI<
        Array<{ id: string; username: string; bot?: boolean }>
      >(
        env,
        `/channels/${input.channel_id}/messages/${input.message_id}/reactions/${encodeEmoji(input.emoji)}?limit=${input.limit}`,
      );

      return {
        users,
        count: users.length,
      };
    },
  });

// ============================================================================
// Export
// ============================================================================

export const discordMessageTools = [
  createSendMessageTool,
  createEditMessageTool,
  createDeleteMessageTool,
  createGetMessageTool,
  createGetChannelMessagesTool,
  createPinMessageTool,
  createUnpinMessageTool,
  createGetPinnedMessagesTool,
  createAddReactionTool,
  createRemoveReactionTool,
  createGetReactionsTool,
];
