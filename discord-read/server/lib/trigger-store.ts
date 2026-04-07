import { createTriggers, type TriggerStorage } from "@decocms/runtime/triggers";
import {
  saveTriggerCredentials,
  loadTriggerCredentials,
  deleteTriggerCredentials,
} from "./supabase-client.ts";
import { z } from "zod";

/**
 * Supabase-backed trigger storage.
 *
 * Uses static SUPABASE_URL / SUPABASE_ANON_KEY env vars (never expire).
 * No configure() needed — always ready as long as Supabase is configured.
 */
class SupabaseTriggerStorage implements TriggerStorage {
  async get(connectionId: string) {
    try {
      const result = await loadTriggerCredentials(connectionId);
      console.log(
        `[TriggerStorage] GET ${connectionId}: ${result ? "found credentials" : "empty"}`,
      );
      return result;
    } catch (error) {
      console.error(
        `[TriggerStorage] GET ${connectionId} failed:`,
        error instanceof Error ? error.message : String(error),
      );
      return null;
    }
  }

  async set(connectionId: string, state: any) {
    try {
      console.log(`[TriggerStorage] SET ${connectionId}: saving credentials`);
      await saveTriggerCredentials(connectionId, state);
    } catch (error) {
      console.error(
        `[TriggerStorage] SET ${connectionId} failed:`,
        error instanceof Error ? error.message : String(error),
      );
    }
  }

  async delete(connectionId: string) {
    try {
      console.log(`[TriggerStorage] DELETE ${connectionId}`);
      await deleteTriggerCredentials(connectionId);
    } catch (error) {
      console.error(
        `[TriggerStorage] DELETE ${connectionId} failed:`,
        error instanceof Error ? error.message : String(error),
      );
    }
  }
}

const storage = new SupabaseTriggerStorage();

export const triggers = createTriggers({
  definitions: [
    {
      type: "discord.message.created",
      description: "Triggered when a message is sent in a Discord channel",
      params: z.object({
        guild_id: z
          .string()
          .optional()
          .describe("Filter by guild ID. Leave empty for all guilds."),
        channel_id: z
          .string()
          .optional()
          .describe("Filter by channel ID. Leave empty for all channels."),
      }),
    },
    {
      type: "discord.message.deleted",
      description: "Triggered when a message is deleted",
      params: z.object({
        guild_id: z
          .string()
          .optional()
          .describe("Filter by guild ID. Leave empty for all guilds."),
      }),
    },
    {
      type: "discord.message.updated",
      description: "Triggered when a message is edited",
      params: z.object({
        guild_id: z
          .string()
          .optional()
          .describe("Filter by guild ID. Leave empty for all guilds."),
      }),
    },
    {
      type: "discord.member.joined",
      description: "Triggered when a user joins a guild",
      params: z.object({
        guild_id: z
          .string()
          .optional()
          .describe("Filter by guild ID. Leave empty for all guilds."),
      }),
    },
    {
      type: "discord.member.left",
      description: "Triggered when a user leaves a guild",
      params: z.object({
        guild_id: z
          .string()
          .optional()
          .describe("Filter by guild ID. Leave empty for all guilds."),
      }),
    },
    {
      type: "discord.member.role.added",
      description: "Triggered when a role is added to a member",
      params: z.object({
        guild_id: z
          .string()
          .optional()
          .describe("Filter by guild ID. Leave empty for all guilds."),
      }),
    },
    {
      type: "discord.member.role.removed",
      description: "Triggered when a role is removed from a member",
      params: z.object({
        guild_id: z
          .string()
          .optional()
          .describe("Filter by guild ID. Leave empty for all guilds."),
      }),
    },
    {
      type: "discord.reaction.added",
      description: "Triggered when a reaction is added to a message",
      params: z.object({
        guild_id: z
          .string()
          .optional()
          .describe("Filter by guild ID. Leave empty for all guilds."),
      }),
    },
    {
      type: "discord.reaction.removed",
      description: "Triggered when a reaction is removed from a message",
      params: z.object({
        guild_id: z
          .string()
          .optional()
          .describe("Filter by guild ID. Leave empty for all guilds."),
      }),
    },
    {
      type: "discord.thread.created",
      description:
        "Triggered when a thread or forum post is created in a Discord channel",
      params: z.object({
        guild_id: z
          .string()
          .optional()
          .describe("Filter by guild ID. Leave empty for all guilds."),
        channel_id: z
          .string()
          .optional()
          .describe(
            "Filter by parent channel ID. Leave empty for all channels.",
          ),
      }),
    },
    {
      type: "discord.thread.deleted",
      description: "Triggered when a thread or forum post is deleted",
      params: z.object({
        guild_id: z
          .string()
          .optional()
          .describe("Filter by guild ID. Leave empty for all guilds."),
      }),
    },
    {
      type: "discord.thread.updated",
      description:
        "Triggered when a thread or forum post is updated (archived, renamed, etc.)",
      params: z.object({
        guild_id: z
          .string()
          .optional()
          .describe("Filter by guild ID. Leave empty for all guilds."),
      }),
    },
    {
      type: "discord.channel.created",
      description: "Triggered when a channel is created in a guild",
      params: z.object({
        guild_id: z
          .string()
          .optional()
          .describe("Filter by guild ID. Leave empty for all guilds."),
      }),
    },
    {
      type: "discord.channel.deleted",
      description: "Triggered when a channel is deleted from a guild",
      params: z.object({
        guild_id: z
          .string()
          .optional()
          .describe("Filter by guild ID. Leave empty for all guilds."),
      }),
    },
  ],
  storage,
});
