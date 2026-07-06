import { createPrivateTool } from "@decocms/runtime/tools";
import { z } from "zod";
import { dataApi } from "../lib/yt-client.ts";
import type { Env } from "../types/env.ts";

export const createCreatePlaylistTool = (env: Env) =>
  createPrivateTool({
    id: "YOUTUBE_ADMIN_CREATE_PLAYLIST",
    description: "Create a new playlist on the channel.",
    inputSchema: z.object({
      title: z.string().max(150).describe("Playlist title"),
      description: z.string().max(5000).optional(),
      privacyStatus: z
        .enum(["public", "unlisted", "private"])
        .default("public"),
      tags: z.array(z.string()).optional(),
    }),
    outputSchema: z.object({
      playlistId: z.string(),
      title: z.string(),
      description: z.string().optional(),
      privacyStatus: z.string(),
      watchUrl: z.string(),
    }),
    execute: async ({ context }) => {
      const result = await dataApi<{
        id: string;
        snippet?: { title?: string; description?: string };
        status?: { privacyStatus?: string };
      }>(env, "/playlists", {
        method: "POST",
        params: { part: "snippet,status" },
        body: {
          snippet: {
            title: context.title,
            description: context.description,
            tags: context.tags,
          },
          status: { privacyStatus: context.privacyStatus },
        },
      });

      return {
        playlistId: result.id,
        title: result.snippet?.title ?? context.title,
        description: result.snippet?.description,
        privacyStatus: result.status?.privacyStatus ?? context.privacyStatus,
        watchUrl: `https://www.youtube.com/playlist?list=${result.id}`,
      };
    },
  });

export const createAddToPlaylistTool = (env: Env) =>
  createPrivateTool({
    id: "YOUTUBE_ADMIN_ADD_TO_PLAYLIST",
    description: "Add a video to one of the channel's playlists.",
    inputSchema: z.object({
      playlistId: z.string().describe("Id of the playlist"),
      videoId: z.string().describe("Id of the video to add"),
      position: z
        .number()
        .int()
        .min(0)
        .optional()
        .describe(
          "0-based position in the playlist (appends to end if omitted)",
        ),
    }),
    outputSchema: z.object({
      playlistItemId: z.string(),
      playlistId: z.string(),
      videoId: z.string(),
      position: z.number().optional(),
    }),
    execute: async ({ context }) => {
      const result = await dataApi<{
        id: string;
        snippet?: {
          playlistId?: string;
          resourceId?: { videoId?: string };
          position?: number;
        };
      }>(env, "/playlistItems", {
        method: "POST",
        params: { part: "snippet" },
        body: {
          snippet: {
            playlistId: context.playlistId,
            resourceId: { kind: "youtube#video", videoId: context.videoId },
            ...(context.position !== undefined && {
              position: context.position,
            }),
          },
        },
      });

      return {
        playlistItemId: result.id,
        playlistId: result.snippet?.playlistId ?? context.playlistId,
        videoId: result.snippet?.resourceId?.videoId ?? context.videoId,
        position: result.snippet?.position,
      };
    },
  });

export const createListPlaylistsTool = (env: Env) =>
  createPrivateTool({
    id: "YOUTUBE_ADMIN_LIST_PLAYLISTS",
    description: "List the channel's playlists.",
    inputSchema: z.object({
      maxResults: z.coerce.number().int().min(1).max(50).default(25),
      pageToken: z.string().optional(),
    }),
    outputSchema: z.object({
      playlists: z.array(
        z.object({
          playlistId: z.string(),
          title: z.string(),
          description: z.string().optional(),
          privacyStatus: z.string(),
          videoCount: z.number(),
          watchUrl: z.string(),
        }),
      ),
      nextPageToken: z.string().optional(),
    }),
    execute: async ({ context }) => {
      const result = await dataApi<{
        items?: Array<{
          id: string;
          snippet?: { title?: string; description?: string };
          status?: { privacyStatus?: string };
          contentDetails?: { itemCount?: number };
        }>;
        nextPageToken?: string;
      }>(env, "/playlists", {
        params: {
          part: "snippet,status,contentDetails",
          mine: true,
          maxResults: context.maxResults,
          pageToken: context.pageToken,
        },
      });

      return {
        playlists: (result.items ?? []).map((item) => ({
          playlistId: item.id,
          title: item.snippet?.title ?? "",
          description: item.snippet?.description,
          privacyStatus: item.status?.privacyStatus ?? "public",
          videoCount: item.contentDetails?.itemCount ?? 0,
          watchUrl: `https://www.youtube.com/playlist?list=${item.id}`,
        })),
        nextPageToken: result.nextPageToken,
      };
    },
  });

export const createUpdatePlaylistTool = (env: Env) =>
  createPrivateTool({
    id: "YOUTUBE_ADMIN_UPDATE_PLAYLIST",
    description: "Update a playlist's title, description or privacy.",
    inputSchema: z.object({
      playlistId: z.string(),
      title: z.string().max(150).optional(),
      description: z.string().max(5000).optional(),
      privacyStatus: z.enum(["public", "unlisted", "private"]).optional(),
    }),
    outputSchema: z.object({
      playlistId: z.string(),
      title: z.string(),
      description: z.string().optional(),
      privacyStatus: z.string(),
      watchUrl: z.string(),
    }),
    execute: async ({ context }) => {
      // Fetch current playlist to merge fields
      const current = await dataApi<{
        items?: Array<{
          id: string;
          snippet?: { title?: string; description?: string };
          status?: { privacyStatus?: string };
        }>;
      }>(env, "/playlists", {
        params: {
          part: "snippet,status",
          id: context.playlistId,
        },
      });

      const existing = current.items?.[0];
      if (!existing) {
        throw new Error(`Playlist not found: ${context.playlistId}`);
      }

      const updatedTitle = context.title ?? existing.snippet?.title ?? "";
      const updatedDescription =
        context.description ?? existing.snippet?.description;
      const updatedPrivacyStatus =
        context.privacyStatus ?? existing.status?.privacyStatus ?? "public";

      const result = await dataApi<{
        id: string;
        snippet?: { title?: string; description?: string };
        status?: { privacyStatus?: string };
      }>(env, "/playlists", {
        method: "PUT",
        params: { part: "snippet,status" },
        body: {
          id: context.playlistId,
          snippet: {
            title: updatedTitle,
            description: updatedDescription,
          },
          status: { privacyStatus: updatedPrivacyStatus },
        },
      });

      return {
        playlistId: result.id,
        title: result.snippet?.title ?? updatedTitle,
        description: result.snippet?.description,
        privacyStatus: result.status?.privacyStatus ?? updatedPrivacyStatus,
        watchUrl: `https://www.youtube.com/playlist?list=${result.id}`,
      };
    },
  });

export const createDeletePlaylistTool = (env: Env) =>
  createPrivateTool({
    id: "YOUTUBE_ADMIN_DELETE_PLAYLIST",
    description: "Delete a playlist (does not delete the videos in it).",
    inputSchema: z.object({
      playlistId: z.string(),
    }),
    outputSchema: z.object({
      playlistId: z.string(),
      deleted: z.boolean(),
    }),
    execute: async ({ context }) => {
      await dataApi<undefined>(env, "/playlists", {
        method: "DELETE",
        params: { id: context.playlistId },
      });

      return {
        playlistId: context.playlistId,
        deleted: true,
      };
    },
  });

export const createListPlaylistItemsTool = (env: Env) =>
  createPrivateTool({
    id: "YOUTUBE_ADMIN_LIST_PLAYLIST_ITEMS",
    description: "List videos in a playlist.",
    inputSchema: z.object({
      playlistId: z.string(),
      maxResults: z.coerce.number().int().min(1).max(50).default(25),
      pageToken: z.string().optional(),
    }),
    outputSchema: z.object({
      items: z.array(
        z.object({
          playlistItemId: z.string(),
          videoId: z.string(),
          title: z.string(),
          position: z.number(),
          privacyStatus: z.string(),
        }),
      ),
      nextPageToken: z.string().optional(),
    }),
    execute: async ({ context }) => {
      const result = await dataApi<{
        items?: Array<{
          id: string;
          snippet?: {
            title?: string;
            position?: number;
            resourceId?: { videoId?: string };
          };
          status?: { privacyStatus?: string };
        }>;
        nextPageToken?: string;
      }>(env, "/playlistItems", {
        params: {
          part: "snippet,status",
          playlistId: context.playlistId,
          maxResults: context.maxResults,
          pageToken: context.pageToken,
        },
      });

      return {
        items: (result.items ?? []).map((item) => ({
          playlistItemId: item.id,
          videoId: item.snippet?.resourceId?.videoId ?? "",
          title: item.snippet?.title ?? "",
          position: item.snippet?.position ?? 0,
          privacyStatus: item.status?.privacyStatus ?? "public",
        })),
        nextPageToken: result.nextPageToken,
      };
    },
  });

export const createRemoveFromPlaylistTool = (env: Env) =>
  createPrivateTool({
    id: "YOUTUBE_ADMIN_REMOVE_FROM_PLAYLIST",
    description:
      "Remove a video from a playlist using its playlistItemId (from LIST_PLAYLIST_ITEMS).",
    inputSchema: z.object({
      playlistItemId: z.string(),
    }),
    outputSchema: z.object({
      playlistItemId: z.string(),
      removed: z.boolean(),
    }),
    execute: async ({ context }) => {
      await dataApi<undefined>(env, "/playlistItems", {
        method: "DELETE",
        params: { id: context.playlistItemId },
      });

      return {
        playlistItemId: context.playlistItemId,
        removed: true,
      };
    },
  });
