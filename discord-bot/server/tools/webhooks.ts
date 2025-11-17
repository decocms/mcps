/**
 * MCP tools for Discord webhook operations
 *
 * This file implements tools for:
 * - Creating webhooks
 * - Executing webhooks
 * - Deleting webhooks
 * - Listing webhooks
 */

import type { Env } from "../main.ts";
import { createDiscordClient } from "./utils/discord-client.ts";
import { createPrivateTool } from "@decocms/runtime/mastra";
import {
  createWebhookInputSchema,
  createWebhookOutputSchema,
  executeWebhookInputSchema,
  executeWebhookOutputSchema,
  deleteWebhookInputSchema,
  deleteWebhookOutputSchema,
  listWebhooksInputSchema,
  listWebhooksOutputSchema,
} from "../lib/types.ts";

/**
 * CREATE_WEBHOOK - Create a new webhook in a channel
 */
export const createCreateWebhookTool = (env: Env) =>
  createPrivateTool({
    id: "CREATE_WEBHOOK",
    description:
      "Create a new webhook for a Discord channel. Webhooks allow external services to post messages to Discord channels. Returns the webhook ID and token needed for execution.",
    inputSchema: createWebhookInputSchema,
    outputSchema: createWebhookOutputSchema,
    execute: async ({ context }) => {
      const { channelId, name, avatar } = context;
      const state = env.DECO_REQUEST_CONTEXT.state;

      if (!name || name.length < 1 || name.length > 80) {
        throw new Error("Webhook name must be between 1 and 80 characters");
      }

      const client = createDiscordClient({ botToken: state.botToken });

      const body: any = {
        name,
      };

      if (avatar) {
        body.avatar = avatar;
      }

      try {
        const webhook = await client.createWebhook(channelId, body);
        return {
          id: webhook.id,
          type: webhook.type,
          name: webhook.name,
          token: webhook.token,
          channel_id: webhook.channel_id,
        };
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        throw new Error(`Failed to create webhook: ${message}`);
      }
    },
  });

/**
 * EXECUTE_WEBHOOK - Execute a webhook to send a message
 */
export const createExecuteWebhookTool = (env: Env) =>
  createPrivateTool({
    id: "EXECUTE_WEBHOOK",
    description:
      "Execute a webhook to send a message to a Discord channel. Webhooks can send messages with custom usernames, avatars, and embeds without requiring bot authentication.",
    inputSchema: executeWebhookInputSchema,
    outputSchema: executeWebhookOutputSchema,
    execute: async ({ context }) => {
      const {
        webhookId,
        webhookToken,
        content,
        username,
        avatarUrl,
        tts = false,
        embeds,
        threadName,
        wait = false,
        threadId,
      } = context;
      const state = env.DECO_REQUEST_CONTEXT.state;

      if (!content && (!embeds || embeds.length === 0)) {
        throw new Error("Webhook content or embeds are required");
      }

      if (content && content.length > 2000) {
        throw new Error("Webhook content cannot exceed 2000 characters");
      }

      const client = createDiscordClient({ botToken: state.botToken });

      const body: any = {
        tts,
      };

      if (content) body.content = content;
      if (username) body.username = username;
      if (avatarUrl) body.avatar_url = avatarUrl;
      if (embeds && embeds.length > 0) body.embeds = embeds;
      if (threadName) body.thread_name = threadName;

      const searchParams: Record<string, string> = {};
      if (wait) searchParams.wait = "true";
      if (threadId) searchParams.thread_id = threadId;

      try {
        const message = await client.executeWebhook(
          webhookId,
          webhookToken,
          body,
          searchParams,
        );

        // If wait is false, Discord returns 204 No Content
        if (!message) {
          return {
            id: "",
            channel_id: "",
            content: content || "",
            timestamp: new Date().toISOString(),
            author: {
              id: "",
              username: username || "Webhook",
              discriminator: "0000",
            },
          };
        }

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
        throw new Error(`Failed to execute webhook: ${message}`);
      }
    },
  });

/**
 * DELETE_WEBHOOK - Delete a webhook
 */
export const createDeleteWebhookTool = (env: Env) =>
  createPrivateTool({
    id: "DELETE_WEBHOOK",
    description:
      "Delete a webhook permanently. This action cannot be undone. The webhook will no longer be able to send messages to the channel.",
    inputSchema: deleteWebhookInputSchema,
    outputSchema: deleteWebhookOutputSchema,
    execute: async ({ context }) => {
      const { webhookId, webhookToken } = context;
      const state = env.DECO_REQUEST_CONTEXT.state;

      const client = createDiscordClient({ botToken: state.botToken });

      try {
        await client.deleteWebhook(webhookId, webhookToken);
        return {
          success: true,
          message: "Webhook deleted successfully",
        };
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        throw new Error(`Failed to delete webhook: ${message}`);
      }
    },
  });

/**
 * LIST_WEBHOOKS - List webhooks from a channel or guild
 */
export const createListWebhooksTool = (env: Env) =>
  createPrivateTool({
    id: "LIST_WEBHOOKS",
    description:
      "List all webhooks from a Discord channel or server (guild). Returns webhook information including IDs, names, and tokens. Either channelId or guildId must be provided.",
    inputSchema: listWebhooksInputSchema,
    outputSchema: listWebhooksOutputSchema,
    execute: async ({ context }) => {
      const { channelId, guildId } = context;
      const state = env.DECO_REQUEST_CONTEXT.state;

      if (!channelId && !guildId) {
        throw new Error("Either channelId or guildId must be provided");
      }

      const client = createDiscordClient({ botToken: state.botToken });

      try {
        let webhooks;
        if (channelId) {
          webhooks = await client.listChannelWebhooks(channelId);
        } else {
          webhooks = await client.listGuildWebhooks(guildId!);
        }

        return {
          webhooks: webhooks.map((webhook: any) => ({
            id: webhook.id,
            type: webhook.type,
            name: webhook.name,
            token: webhook.token,
            channel_id: webhook.channel_id,
          })),
        };
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        throw new Error(`Failed to list webhooks: ${message}`);
      }
    },
  });

/**
 * Array of all webhook-related tools
 */
export const webhookTools = [
  createCreateWebhookTool,
  createExecuteWebhookTool,
  createDeleteWebhookTool,
  createListWebhooksTool,
];
