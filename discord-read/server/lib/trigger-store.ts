import { createTriggers, type TriggerStorage } from "@decocms/runtime/triggers";
import { StudioKV } from "@decocms/runtime/trigger-storage";
import { z } from "zod";

/**
 * Lazy-initialized StudioKV storage.
 *
 * On startup, MESH_URL and MESH_API_KEY env vars may not be set yet.
 * This wrapper defers StudioKV creation until the first onChange provides
 * meshUrl + token, so trigger credentials survive pod restarts without
 * requiring static env vars.
 */
class LazyStudioKV implements TriggerStorage {
  private inner: StudioKV | null = null;

  constructor() {
    // Try env vars at startup (works if they're set)
    if (process.env.MESH_URL && process.env.MESH_API_KEY) {
      this.inner = new StudioKV({
        url: process.env.MESH_URL,
        apiKey: process.env.MESH_API_KEY,
      });
      console.log("[TriggerStorage] Initialized from env vars");
    }
  }

  /** Called from onChange when we learn the mesh URL and token */
  configure(url: string, apiKey: string): void {
    if (this.inner) return; // Already configured
    this.inner = new StudioKV({ url, apiKey });
    console.log("[TriggerStorage] Initialized from onChange credentials");
  }

  get isReady(): boolean {
    return this.inner !== null;
  }

  async get(connectionId: string) {
    return this.inner?.get(connectionId) ?? null;
  }
  async set(connectionId: string, state: any) {
    await this.inner?.set(connectionId, state);
  }
  async delete(connectionId: string) {
    await this.inner?.delete(connectionId);
  }
}

export const triggerStorage = new LazyStudioKV();
const storage = triggerStorage;

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
