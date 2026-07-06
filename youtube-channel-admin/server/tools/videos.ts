import { createPrivateTool } from "@decocms/runtime/tools";
import { z } from "zod";
import { UPLOAD_API_BASE } from "../constants.ts";
import { dataApi, googleFetch } from "../lib/yt-client.ts";
import {
  getVideosByIds,
  listMyVideos,
  type VideoListResponse,
} from "../lib/yt-data.ts";
import type { Env } from "../types/env.ts";
import { MyVideoSchema } from "./views.ts";

export const createListMyVideosTool = (env: Env) =>
  createPrivateTool({
    id: "YOUTUBE_ADMIN_LIST_MY_VIDEOS",
    description:
      "List the authorized channel's videos (newest first) with full owner metadata: stats, privacy, upload/processing status and warnings. Paginated via pageToken.",
    inputSchema: z.object({
      maxResults: z.coerce
        .number()
        .int()
        .min(1)
        .max(50)
        .default(25)
        .describe("Videos per page (1-50)"),
      pageToken: z
        .string()
        .optional()
        .describe("nextPageToken from a previous call"),
    }),
    outputSchema: z.object({
      videos: z.array(MyVideoSchema),
      nextPageToken: z.string().optional(),
    }),
    execute: async ({ context }) =>
      listMyVideos(env, {
        maxResults: context.maxResults,
        pageToken: context.pageToken,
      }),
  });

export const createUpdateVideoTool = (env: Env) =>
  createPrivateTool({
    id: "YOUTUBE_ADMIN_UPDATE_VIDEO",
    description:
      "Update a video's title, description, tags, category and/or privacy status. Only the fields you pass change — the current snippet is fetched and merged first (the API replaces the whole snippet otherwise). Quota: ~50 units.",
    inputSchema: z.object({
      videoId: z.string().describe("Id of a video owned by the channel"),
      title: z.string().max(100).optional(),
      description: z.string().max(5000).optional(),
      tags: z
        .array(z.string())
        .optional()
        .describe("Replaces the full tag list when provided"),
      categoryId: z
        .string()
        .optional()
        .describe("YouTube category id (e.g. 22 = People & Blogs)"),
      privacyStatus: z.enum(["public", "unlisted", "private"]).optional(),
    }),
    outputSchema: z.object({
      videoId: z.string(),
      title: z.string(),
      description: z.string(),
      tags: z.array(z.string()),
      categoryId: z.string().optional(),
      privacyStatus: z.string().optional(),
    }),
    execute: async ({ context }) => {
      const current = await dataApi<VideoListResponse>(env, "/videos", {
        params: { part: "snippet,status", id: context.videoId },
      });
      const video = current.items?.[0];
      if (!video) {
        throw new Error(
          `Video ${context.videoId} not found or not owned by the authorized channel.`,
        );
      }

      // Fetch-merge-put: videos.update replaces the entire snippet, and
      // categoryId is required on update — preserve everything not passed.
      const snippet = {
        ...video.snippet,
        title: context.title ?? video.snippet?.title,
        description: context.description ?? video.snippet?.description,
        tags: context.tags ?? video.snippet?.tags,
        categoryId: context.categoryId ?? video.snippet?.categoryId,
      };
      const status = {
        ...video.status,
        privacyStatus: context.privacyStatus ?? video.status?.privacyStatus,
      };

      const updated = await dataApi<
        NonNullable<VideoListResponse["items"]>[number]
      >(env, "/videos", {
        method: "PUT",
        params: { part: "snippet,status" },
        body: { id: context.videoId, snippet, status },
      });

      return {
        videoId: context.videoId,
        title: updated.snippet?.title ?? "",
        description: updated.snippet?.description ?? "",
        tags: updated.snippet?.tags ?? [],
        categoryId: updated.snippet?.categoryId,
        privacyStatus: updated.status?.privacyStatus,
      };
    },
  });

const MAX_THUMBNAIL_BYTES = 2 * 1024 * 1024; // API limit

export const createSetThumbnailTool = (env: Env) =>
  createPrivateTool({
    id: "YOUTUBE_ADMIN_SET_THUMBNAIL",
    description:
      "Set a video's custom thumbnail from an image URL (JPEG/PNG, max 2MB). The channel must be verified (phone) to use custom thumbnails — Google returns 403 otherwise.",
    inputSchema: z.object({
      videoId: z.string().describe("Id of a video owned by the channel"),
      imageUrl: z
        .string()
        .describe(
          "Public or presigned URL of the image (object-storage presigned GET URLs work)",
        ),
    }),
    outputSchema: z.object({
      videoId: z.string(),
      thumbnails: z.record(
        z.string(),
        z.object({
          url: z.string().optional(),
          width: z.number().optional(),
          height: z.number().optional(),
        }),
      ),
    }),
    execute: async ({ context }) => {
      const imageResponse = await fetch(context.imageUrl);
      if (!imageResponse.ok) {
        throw new Error(
          `Could not fetch image from URL (${imageResponse.status})`,
        );
      }
      const contentType =
        imageResponse.headers.get("content-type") ?? "image/jpeg";
      if (!/^image\/(jpeg|png)/.test(contentType)) {
        throw new Error(
          `Unsupported thumbnail content-type "${contentType}" — use JPEG or PNG.`,
        );
      }
      const bytes = await imageResponse.arrayBuffer();
      if (bytes.byteLength > MAX_THUMBNAIL_BYTES) {
        throw new Error(
          `Thumbnail is ${(bytes.byteLength / 1024 / 1024).toFixed(1)}MB — the API limit is 2MB.`,
        );
      }

      const result = await googleFetch<{
        items?: Array<
          Record<string, { url?: string; width?: number; height?: number }>
        >;
      }>(
        env,
        `${UPLOAD_API_BASE}/thumbnails/set?videoId=${encodeURIComponent(context.videoId)}&uploadType=media`,
        {
          method: "POST",
          headers: { "Content-Type": contentType },
          body: bytes,
        },
      );

      return {
        videoId: context.videoId,
        thumbnails: result.items?.[0] ?? {},
      };
    },
  });

export const createGetVideosTool = (env: Env) =>
  createPrivateTool({
    id: "YOUTUBE_ADMIN_GET_VIDEOS",
    description:
      "Fetch full owner metadata for specific videos of the channel by id (up to 50).",
    inputSchema: z.object({
      videoIds: z.array(z.string()).min(1).max(50),
    }),
    outputSchema: z.object({ videos: z.array(MyVideoSchema) }),
    execute: async ({ context }) => ({
      videos: await getVideosByIds(env, context.videoIds),
    }),
  });

export const createDeleteVideoTool = (env: Env) =>
  createPrivateTool({
    id: "YOUTUBE_ADMIN_DELETE_VIDEO",
    description:
      "Permanently delete one of the channel's videos. This cannot be undone. Quota: 50 units.",
    inputSchema: z.object({
      videoId: z.string(),
    }),
    outputSchema: z.object({
      videoId: z.string(),
      deleted: z.boolean(),
    }),
    execute: async ({ context }) => {
      await dataApi(env, "/videos", {
        method: "DELETE",
        params: { id: context.videoId },
      });
      return { videoId: context.videoId, deleted: true };
    },
  });

export const createRateVideoTool = (env: Env) =>
  createPrivateTool({
    id: "YOUTUBE_ADMIN_RATE_VIDEO",
    description:
      "Like, dislike or remove your rating from any YouTube video. rating: 'like' | 'dislike' | 'none'.",
    inputSchema: z.object({
      videoId: z.string(),
      rating: z.enum(["like", "dislike", "none"]),
    }),
    outputSchema: z.object({
      videoId: z.string(),
      rating: z.string(),
    }),
    execute: async ({ context }) => {
      await dataApi(env, "/videos/rate", {
        method: "POST",
        params: { id: context.videoId, rating: context.rating },
      });
      return { videoId: context.videoId, rating: context.rating };
    },
  });
