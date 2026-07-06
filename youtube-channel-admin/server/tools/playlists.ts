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
