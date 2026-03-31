import { createTriggers } from "@decocms/runtime/triggers";
import { StudioKV } from "@decocms/runtime/trigger-storage";
import { z } from "zod";

const storage =
  process.env.MESH_URL && process.env.MESH_API_KEY
    ? new StudioKV({
        url: process.env.MESH_URL,
        apiKey: process.env.MESH_API_KEY,
      })
    : undefined;

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
  ],
  storage,
});
