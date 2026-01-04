/**
 * MCP tools for Discord message operations
 *
 * This file implements tools for:
 * - Sending, editing, and deleting messages
 * - Adding and removing reactions
 * - Pinning and unpinning messages
 * - Fetching messages and reactions
 */

import type { Env } from "../main.ts";
import { createDiscordClient } from "./utils/discord-client.ts";
import { createPrivateTool } from "@decocms/runtime/mastra";
import {
  sendMessageInputSchema,
  sendMessageOutputSchema,
  editMessageInputSchema,
  editMessageOutputSchema,
  deleteMessageInputSchema,
  deleteMessageOutputSchema,
  getChannelMessagesInputSchema,
  getChannelMessagesOutputSchema,
  getMessageInputSchema,
  getMessageOutputSchema,
  addReactionInputSchema,
  addReactionOutputSchema,
  removeReactionInputSchema,
  removeReactionOutputSchema,
  getMessageReactionsInputSchema,
  getMessageReactionsOutputSchema,
  pinMessageInputSchema,
  pinMessageOutputSchema,
  unpinMessageInputSchema,
  unpinMessageOutputSchema,
  getPinnedMessagesInputSchema,
  getPinnedMessagesOutputSchema,
} from "../lib/types.ts";

/**
 * SEND_MESSAGE - Send a message to a Discord channel
 */
export const createSendMessageTool = (env: Env) =>
  createPrivateTool({
    id: "SEND_MESSAGE",
    description:
      "Send a message to a Discord channel. Supports text content, embeds, TTS, and replies. Messages can include rich formatting and mentions.",
    inputSchema: sendMessageInputSchema,
    outputSchema: sendMessageOutputSchema,
    execute: async ({ context }) => {
      const {
        channelId,
        content,
        tts = false,
        embeds,
        replyToMessageId,
        replyMention = false,
      } = context;
      const state = env.DECO_REQUEST_CONTEXT.state;

      if (!content && (!embeds || embeds.length === 0)) {
        throw new Error("Message content or embeds are required");
      }

      if (content && content.length > 2000) {
        throw new Error("Message content cannot exceed 2000 characters");
      }

      const client = createDiscordClient({ botToken: state.botToken });

      const body: any = {
        tts,
      };

      if (content) {
        body.content = content;
      }

      if (embeds && embeds.length > 0) {
        body.embeds = embeds;
      }

      if (replyToMessageId) {
        body.message_reference = {
          message_id: replyToMessageId,
        };
        body.allowed_mentions = {
          replied_user: replyMention,
        };
      }

      try {
        const message = await client.sendMessage(channelId, body);
        return {
          id: message.id,
          channel_id: message.channel_id,
          content: message.content,
          timestamp: message.timestamp,
          author: {
            id: message.author.id,
            username: message.author.username,
            discriminator: message.author.discriminator,
          },
        };
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        throw new Error(`Failed to send message: ${message}`);
      }
    },
  });

/**
 * EDIT_MESSAGE - Edit an existing Discord message
 */
export const createEditMessageTool = (env: Env) =>
  createPrivateTool({
    id: "EDIT_MESSAGE",
    description:
      "Edit an existing message in a Discord channel. You can update the content and/or embeds. Only messages sent by the bot can be edited.",
    inputSchema: editMessageInputSchema,
    outputSchema: editMessageOutputSchema,
    execute: async ({ context }) => {
      const { channelId, messageId, content, embeds } = context;
      const state = env.DECO_REQUEST_CONTEXT.state;

      if (!content && (!embeds || embeds.length === 0)) {
        throw new Error("Content or embeds are required for editing");
      }

      const client = createDiscordClient({ botToken: state.botToken });

      const body: any = {};

      if (content) {
        if (content.length > 2000) {
          throw new Error("Message content cannot exceed 2000 characters");
        }
        body.content = content;
      }

      if (embeds && embeds.length > 0) {
        body.embeds = embeds;
      }

      try {
        const message = await client.editMessage(channelId, messageId, body);
        return {
          id: message.id,
          channel_id: message.channel_id,
          content: message.content,
          timestamp: message.timestamp,
          author: {
            id: message.author.id,
            username: message.author.username,
            discriminator: message.author.discriminator,
          },
        };
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        throw new Error(`Failed to edit message: ${message}`);
      }
    },
  });

/**
 * DELETE_MESSAGE - Delete a Discord message
 */
export const createDeleteMessageTool = (env: Env) =>
  createPrivateTool({
    id: "DELETE_MESSAGE",
    description:
      "Delete a message from a Discord channel. The bot needs Manage Messages permission to delete messages from other users, or can always delete its own messages.",
    inputSchema: deleteMessageInputSchema,
    outputSchema: deleteMessageOutputSchema,
    execute: async ({ context }) => {
      const { channelId, messageId } = context;
      const state = env.DECO_REQUEST_CONTEXT.state;

      const client = createDiscordClient({ botToken: state.botToken });

      try {
        await client.deleteMessage(channelId, messageId);
        return {
          success: true,
          message: "Message deleted successfully",
        };
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        throw new Error(`Failed to delete message: ${message}`);
      }
    },
  });

/**
 * GET_CHANNEL_MESSAGES - Get messages from a Discord channel
 */
export const createGetChannelMessagesTool = (env: Env) =>
  createPrivateTool({
    id: "GET_CHANNEL_MESSAGES",
    description:
      "Fetch messages from a Discord channel. Supports pagination with before, after, and around parameters. Returns up to 100 messages per request.",
    inputSchema: getChannelMessagesInputSchema,
    outputSchema: getChannelMessagesOutputSchema,
    execute: async ({ context }) => {
      const { channelId, limit = 50, before, after, around } = context;
      const state = env.DECO_REQUEST_CONTEXT.state;

      const client = createDiscordClient({ botToken: state.botToken });

      const searchParams: Record<string, string> = {
        limit: Math.min(Math.max(limit, 1), 100).toString(),
      };

      if (before) searchParams.before = before;
      if (after) searchParams.after = after;
      if (around) searchParams.around = around;

      try {
        const messages = await client.getChannelMessages(
          channelId,
          searchParams,
        );
        return {
          messages: messages.map((msg: any) => ({
            id: msg.id,
            channel_id: msg.channel_id,
            content: msg.content,
            timestamp: msg.timestamp,
            author: {
              id: msg.author.id,
              username: msg.author.username,
              discriminator: msg.author.discriminator,
            },
          })),
        };
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        throw new Error(`Failed to get channel messages: ${message}`);
      }
    },
  });

/**
 * GET_MESSAGE - Get a specific Discord message
 */
export const createGetMessageTool = (env: Env) =>
  createPrivateTool({
    id: "GET_MESSAGE",
    description:
      "Fetch a specific message by ID from a Discord channel. Returns the full message object with all metadata.",
    inputSchema: getMessageInputSchema,
    outputSchema: getMessageOutputSchema,
    execute: async ({ context }) => {
      const { channelId, messageId } = context;
      const state = env.DECO_REQUEST_CONTEXT.state;

      const client = createDiscordClient({ botToken: state.botToken });

      try {
        const message = await client.getMessage(channelId, messageId);
        return {
          id: message.id,
          channel_id: message.channel_id,
          content: message.content,
          timestamp: message.timestamp,
          author: {
            id: message.author.id,
            username: message.author.username,
            discriminator: message.author.discriminator,
          },
        };
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        throw new Error(`Failed to get message: ${message}`);
      }
    },
  });

/**
 * ADD_REACTION - Add a reaction to a Discord message
 */
export const createAddReactionTool = (env: Env) =>
  createPrivateTool({
    id: "ADD_REACTION",
    description:
      "Add a reaction (emoji) to a Discord message. Supports both Unicode emojis and custom server emojis. For custom emojis, use the format 'name:id'.",
    inputSchema: addReactionInputSchema,
    outputSchema: addReactionOutputSchema,
    execute: async ({ context }) => {
      const { channelId, messageId, emoji } = context;
      const state = env.DECO_REQUEST_CONTEXT.state;

      const client = createDiscordClient({ botToken: state.botToken });

      try {
        // Encode the emoji for URL
        const encodedEmoji = encodeURIComponent(emoji);
        await client.addReaction(channelId, messageId, encodedEmoji);
        return {
          success: true,
          message: "Reaction added successfully",
        };
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        throw new Error(`Failed to add reaction: ${message}`);
      }
    },
  });

/**
 * REMOVE_REACTION - Remove a reaction from a Discord message
 */
export const createRemoveReactionTool = (env: Env) =>
  createPrivateTool({
    id: "REMOVE_REACTION",
    description:
      "Remove the bot's reaction from a Discord message. Only removes reactions added by the bot itself.",
    inputSchema: removeReactionInputSchema,
    outputSchema: removeReactionOutputSchema,
    execute: async ({ context }) => {
      const { channelId, messageId, emoji } = context;
      const state = env.DECO_REQUEST_CONTEXT.state;

      const client = createDiscordClient({ botToken: state.botToken });

      try {
        // Encode the emoji for URL
        const encodedEmoji = encodeURIComponent(emoji);
        await client.removeReaction(channelId, messageId, encodedEmoji);
        return {
          success: true,
          message: "Reaction removed successfully",
        };
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        throw new Error(`Failed to remove reaction: ${message}`);
      }
    },
  });

/**
 * GET_MESSAGE_REACTIONS - Get users who reacted with a specific emoji
 */
export const createGetMessageReactionsTool = (env: Env) =>
  createPrivateTool({
    id: "GET_MESSAGE_REACTIONS",
    description:
      "Get a list of users who reacted to a message with a specific emoji. Returns up to 100 users per request with pagination support.",
    inputSchema: getMessageReactionsInputSchema,
    outputSchema: getMessageReactionsOutputSchema,
    execute: async ({ context }) => {
      const { channelId, messageId, emoji, limit = 25, after } = context;
      const state = env.DECO_REQUEST_CONTEXT.state;

      const client = createDiscordClient({ botToken: state.botToken });

      const searchParams: Record<string, string> = {
        limit: Math.min(Math.max(limit, 1), 100).toString(),
      };

      if (after) searchParams.after = after;

      try {
        // Encode the emoji for URL
        const encodedEmoji = encodeURIComponent(emoji);
        const users = await client.getMessageReactions(
          channelId,
          messageId,
          encodedEmoji,
          searchParams,
        );
        return {
          users: users.map((user: any) => ({
            id: user.id,
            username: user.username,
            discriminator: user.discriminator,
          })),
        };
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        throw new Error(`Failed to get message reactions: ${message}`);
      }
    },
  });

/**
 * PIN_MESSAGE - Pin a message in a Discord channel
 */
export const createPinMessageTool = (env: Env) =>
  createPrivateTool({
    id: "PIN_MESSAGE",
    description:
      "Pin a message in a Discord channel. Pinned messages appear at the top of the channel. Channels can have up to 50 pinned messages.",
    inputSchema: pinMessageInputSchema,
    outputSchema: pinMessageOutputSchema,
    execute: async ({ context }) => {
      const { channelId, messageId } = context;
      const state = env.DECO_REQUEST_CONTEXT.state;

      const client = createDiscordClient({ botToken: state.botToken });

      try {
        await client.pinMessage(channelId, messageId);
        return {
          success: true,
          message: "Message pinned successfully",
        };
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        throw new Error(`Failed to pin message: ${message}`);
      }
    },
  });

/**
 * UNPIN_MESSAGE - Unpin a message from a Discord channel
 */
export const createUnpinMessageTool = (env: Env) =>
  createPrivateTool({
    id: "UNPIN_MESSAGE",
    description:
      "Unpin a previously pinned message from a Discord channel. Removes the message from the pinned messages list.",
    inputSchema: unpinMessageInputSchema,
    outputSchema: unpinMessageOutputSchema,
    execute: async ({ context }) => {
      const { channelId, messageId } = context;
      const state = env.DECO_REQUEST_CONTEXT.state;

      const client = createDiscordClient({ botToken: state.botToken });

      try {
        await client.unpinMessage(channelId, messageId);
        return {
          success: true,
          message: "Message unpinned successfully",
        };
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        throw new Error(`Failed to unpin message: ${message}`);
      }
    },
  });

/**
 * GET_PINNED_MESSAGES - Get all pinned messages from a channel
 */
export const createGetPinnedMessagesTool = (env: Env) =>
  createPrivateTool({
    id: "GET_PINNED_MESSAGES",
    description:
      "Fetch all pinned messages from a Discord channel. Returns a list of up to 50 pinned messages.",
    inputSchema: getPinnedMessagesInputSchema,
    outputSchema: getPinnedMessagesOutputSchema,
    execute: async ({ context }) => {
      const { channelId } = context;
      const state = env.DECO_REQUEST_CONTEXT.state;

      const client = createDiscordClient({ botToken: state.botToken });

      try {
        const messages = await client.getPinnedMessages(channelId);
        return {
          messages: messages.map((msg: any) => ({
            id: msg.id,
            channel_id: msg.channel_id,
            content: msg.content,
            timestamp: msg.timestamp,
            author: {
              id: msg.author.id,
              username: msg.author.username,
              discriminator: msg.author.discriminator,
            },
          })),
        };
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        throw new Error(`Failed to get pinned messages: ${message}`);
      }
    },
  });

/**
 * Array of all message-related tools
 */
export const messageTools = [
  createSendMessageTool,
  createEditMessageTool,
  createDeleteMessageTool,
  createGetChannelMessagesTool,
  createGetMessageTool,
  createAddReactionTool,
  createRemoveReactionTool,
  createGetMessageReactionsTool,
  createPinMessageTool,
  createUnpinMessageTool,
  createGetPinnedMessagesTool,
];
