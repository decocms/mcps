import { createPrivateTool } from "@decocms/runtime/tools";
import { z } from "zod";
import { dataApi } from "../lib/yt-client.ts";
import type { Env } from "../types/env.ts";

interface ChannelSectionItem {
  id: string;
  snippet?: {
    type?: string;
    title?: string;
    position?: number;
  };
  contentDetails?: {
    playlists?: string[];
    channels?: string[];
  };
}

type ChannelSectionResponse = { items?: ChannelSectionItem[] };

const sectionOutputSchema = z.object({
  sectionId: z.string(),
  type: z.string(),
  title: z.string().optional(),
  position: z.number().optional(),
  playlistIds: z.array(z.string()),
  channelIds: z.array(z.string()),
});

function mapSection(item: ChannelSectionItem) {
  return {
    sectionId: item.id,
    type: item.snippet?.type ?? "",
    title: item.snippet?.title,
    position: item.snippet?.position,
    playlistIds: item.contentDetails?.playlists ?? [],
    channelIds: item.contentDetails?.channels ?? [],
  };
}

export const createListChannelSectionsTool = (env: Env) =>
  createPrivateTool({
    id: "YOUTUBE_ADMIN_LIST_CHANNEL_SECTIONS",
    description:
      "List the channel's sections as they appear on the channel page (e.g. playlists, featured channels, recent uploads rows).",
    inputSchema: z.object({}),
    outputSchema: z.object({
      sections: z.array(sectionOutputSchema),
    }),
    execute: async () => {
      const result = await dataApi<ChannelSectionResponse>(
        env,
        "/channelSections",
        {
          params: { part: "snippet,contentDetails", mine: true },
        },
      );

      return {
        sections: (result.items ?? []).map(mapSection),
      };
    },
  });

export const createCreateChannelSectionTool = (env: Env) =>
  createPrivateTool({
    id: "YOUTUBE_ADMIN_CREATE_CHANNEL_SECTION",
    description:
      "Create a new section on the channel page. Common types: singlePlaylist, multipleChannels, singleChannel, allPlaylists, recentUploads, featuredPlaylists.",
    inputSchema: z.object({
      type: z
        .string()
        .describe(
          "Section type, e.g. singlePlaylist, multipleChannels, recentUploads",
        ),
      title: z.string().optional(),
      position: z
        .number()
        .int()
        .min(0)
        .optional()
        .describe("Display position (0-indexed)"),
      playlistIds: z.array(z.string()).optional(),
      channelIds: z.array(z.string()).optional(),
    }),
    outputSchema: sectionOutputSchema,
    execute: async ({ context }) => {
      const result = await dataApi<ChannelSectionItem>(
        env,
        "/channelSections",
        {
          method: "POST",
          params: { part: "snippet,contentDetails" },
          body: {
            snippet: {
              type: context.type,
              title: context.title,
              defaultLanguage: "pt",
            },
            contentDetails: {
              playlists: context.playlistIds,
              channels: context.channelIds,
            },
          },
        },
      );

      return mapSection(result);
    },
  });

export const createUpdateChannelSectionTool = (env: Env) =>
  createPrivateTool({
    id: "YOUTUBE_ADMIN_UPDATE_CHANNEL_SECTION",
    description:
      "Update a channel section's title, position or playlist/channel list.",
    inputSchema: z.object({
      sectionId: z.string(),
      title: z.string().optional(),
      position: z.number().int().min(0).optional(),
      playlistIds: z.array(z.string()).optional(),
      channelIds: z.array(z.string()).optional(),
    }),
    outputSchema: sectionOutputSchema,
    execute: async ({ context }) => {
      const current = await dataApi<ChannelSectionResponse>(
        env,
        "/channelSections",
        {
          params: { part: "snippet,contentDetails", id: context.sectionId },
        },
      );

      const existing = current.items?.[0];
      if (!existing) {
        throw new Error(`Channel section not found: ${context.sectionId}`);
      }

      const mergedSnippet = {
        ...existing.snippet,
        ...(context.title !== undefined && { title: context.title }),
        ...(context.position !== undefined && { position: context.position }),
      };

      const mergedContentDetails = {
        playlists: context.playlistIds ?? existing.contentDetails?.playlists,
        channels: context.channelIds ?? existing.contentDetails?.channels,
      };

      const result = await dataApi<ChannelSectionItem>(
        env,
        "/channelSections",
        {
          method: "PUT",
          params: { part: "snippet,contentDetails" },
          body: {
            id: context.sectionId,
            snippet: mergedSnippet,
            contentDetails: mergedContentDetails,
          },
        },
      );

      return mapSection(result);
    },
  });

export const createDeleteChannelSectionTool = (env: Env) =>
  createPrivateTool({
    id: "YOUTUBE_ADMIN_DELETE_CHANNEL_SECTION",
    description: "Delete a channel section.",
    inputSchema: z.object({
      sectionId: z.string(),
    }),
    outputSchema: z.object({
      sectionId: z.string(),
      deleted: z.boolean(),
    }),
    execute: async ({ context }) => {
      await dataApi<undefined>(env, "/channelSections", {
        method: "DELETE",
        params: { id: context.sectionId },
      });

      return {
        sectionId: context.sectionId,
        deleted: true,
      };
    },
  });
