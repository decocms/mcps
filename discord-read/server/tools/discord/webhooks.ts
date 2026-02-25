/**
 * Discord Webhook Tools
 *
 * Tools for managing and executing webhooks.
 */

import { createTool } from "@decocms/runtime/tools";
import z from "zod";
import type { Env } from "../../types/env.ts";
import { discordAPI } from "./api.ts";

// ============================================================================
// Create Webhook
// ============================================================================

export const createCreateWebhookTool = (env: Env) =>
  createTool({
    id: "DISCORD_CREATE_WEBHOOK",
    description: "Create a webhook in a Discord channel",
    annotations: { destructiveHint: false, openWorldHint: true },
    inputSchema: z
      .object({
        channel_id: z.string().describe("The channel ID"),
        name: z.string().describe("Webhook name (1-80 characters)"),
        avatar: z
          .string()
          .optional()
          .describe("Avatar image URL (will be converted to base64)"),
        reason: z.string().optional().describe("Reason (audit log)"),
      })
      .strict(),
    outputSchema: z
      .object({
        id: z.string(),
        token: z.string(),
        name: z.string(),
        channel_id: z.string(),
        url: z.string(),
      })
      .strict(),
    execute: async ({ context }: { context: unknown }) => {
      const input = context as {
        channel_id: string;
        name: string;
        avatar?: string;
        reason?: string;
      };

      const body: Record<string, unknown> = { name: input.name };

      // Note: Avatar needs to be base64 data URI - skipping for simplicity
      // If avatar URL is provided, it would need to be fetched and converted

      const result = await discordAPI<{
        id: string;
        token: string;
        name: string;
        channel_id: string;
      }>(env, `/channels/${input.channel_id}/webhooks`, {
        method: "POST",
        body,
        reason: input.reason,
      });

      return {
        id: result.id,
        token: result.token,
        name: result.name,
        channel_id: result.channel_id,
        url: `https://discord.com/api/webhooks/${result.id}/${result.token}`,
      };
    },
  });

// ============================================================================
// List Webhooks
// ============================================================================

export const createListWebhooksTool = (env: Env) =>
  createTool({
    id: "DISCORD_LIST_WEBHOOKS",
    description: "List webhooks from a Discord channel or guild",
    annotations: { readOnlyHint: true },
    inputSchema: z
      .object({
        channel_id: z
          .string()
          .optional()
          .describe("Channel ID (list channel webhooks)"),
        guild_id: z
          .string()
          .optional()
          .describe("Guild ID (list all guild webhooks)"),
      })
      .strict(),
    outputSchema: z
      .object({
        webhooks: z.array(
          z.object({
            id: z.string(),
            name: z.string(),
            channel_id: z.string(),
            type: z.number(),
            user: z
              .object({
                id: z.string(),
                username: z.string(),
              })
              .optional(),
          }),
        ),
        count: z.number(),
      })
      .strict(),
    execute: async ({ context }: { context: unknown }) => {
      const input = context as {
        channel_id?: string;
        guild_id?: string;
      };

      let endpoint: string;
      if (input.channel_id) {
        endpoint = `/channels/${input.channel_id}/webhooks`;
      } else if (input.guild_id) {
        endpoint = `/guilds/${input.guild_id}/webhooks`;
      } else {
        throw new Error("Either channel_id or guild_id is required");
      }

      const webhooks = await discordAPI<
        Array<{
          id: string;
          name: string;
          channel_id: string;
          type: number;
          user?: { id: string; username: string };
        }>
      >(env, endpoint);

      return {
        webhooks: webhooks.map((w) => ({
          id: w.id,
          name: w.name,
          channel_id: w.channel_id,
          type: w.type,
          user: w.user,
        })),
        count: webhooks.length,
      };
    },
  });

// ============================================================================
// Delete Webhook
// ============================================================================

export const createDeleteWebhookTool = (env: Env) =>
  createTool({
    id: "DISCORD_DELETE_WEBHOOK",
    description: "Delete a Discord webhook",
    annotations: { destructiveHint: true, openWorldHint: true },
    inputSchema: z
      .object({
        webhook_id: z.string().describe("The webhook ID"),
        webhook_token: z
          .string()
          .optional()
          .describe("Webhook token (if deleting without bot auth)"),
        reason: z.string().optional().describe("Reason (audit log)"),
      })
      .strict(),
    outputSchema: z.object({ success: z.boolean() }).strict(),
    execute: async ({ context }: { context: unknown }) => {
      const input = context as {
        webhook_id: string;
        webhook_token?: string;
        reason?: string;
      };

      const endpoint = input.webhook_token
        ? `/webhooks/${input.webhook_id}/${input.webhook_token}`
        : `/webhooks/${input.webhook_id}`;

      await discordAPI(env, endpoint, {
        method: "DELETE",
        reason: input.reason,
      });

      return { success: true };
    },
  });

// ============================================================================
// Execute Webhook
// ============================================================================

export const createExecuteWebhookTool = () =>
  createTool({
    id: "DISCORD_EXECUTE_WEBHOOK",
    description: "Send a message through a Discord webhook",
    annotations: { destructiveHint: false, openWorldHint: true },
    inputSchema: z
      .object({
        webhook_id: z.string().describe("The webhook ID"),
        webhook_token: z.string().describe("The webhook token"),
        content: z.string().optional().describe("Message content"),
        username: z.string().optional().describe("Override webhook username"),
        avatar_url: z.string().optional().describe("Override webhook avatar"),
        embeds: z
          .array(
            z.object({
              title: z.string().optional(),
              description: z.string().optional(),
              url: z.string().optional(),
              color: z.number().optional(),
              footer: z.object({ text: z.string() }).optional(),
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
          .describe("Embed objects"),
        thread_id: z.string().optional().describe("Send to a thread"),
        wait: z
          .boolean()
          .default(false)
          .describe("Wait for message and return it"),
      })
      .strict(),
    outputSchema: z
      .object({
        success: z.boolean(),
        message_id: z.string().optional(),
      })
      .strict(),
    execute: async ({ context }: { context: unknown }) => {
      const input = context as {
        webhook_id: string;
        webhook_token: string;
        content?: string;
        username?: string;
        avatar_url?: string;
        embeds?: unknown[];
        thread_id?: string;
        wait: boolean;
      };

      const body: Record<string, unknown> = {};
      if (input.content) body.content = input.content;
      if (input.username) body.username = input.username;
      if (input.avatar_url) body.avatar_url = input.avatar_url;
      if (input.embeds) body.embeds = input.embeds;

      const params = new URLSearchParams();
      if (input.wait) params.set("wait", "true");
      if (input.thread_id) params.set("thread_id", input.thread_id);

      const paramStr = params.toString();
      const endpoint = `/webhooks/${input.webhook_id}/${input.webhook_token}${paramStr ? `?${paramStr}` : ""}`;

      // Execute webhook doesn't use bot authorization
      const response = await fetch(`https://discord.com/api/v10${endpoint}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });

      if (!response.ok) {
        const errorText = await response.text().catch(() => "");
        throw new Error(
          `Discord API error (${response.status}): ${errorText || response.statusText}`,
        );
      }

      if (input.wait && response.status !== 204) {
        const result = (await response.json()) as { id: string };
        return { success: true, message_id: result.id };
      }

      return { success: true };
    },
  });

// ============================================================================
// Export
// ============================================================================

export const discordWebhookTools = [
  createCreateWebhookTool,
  createListWebhooksTool,
  createDeleteWebhookTool,
  createExecuteWebhookTool,
];
