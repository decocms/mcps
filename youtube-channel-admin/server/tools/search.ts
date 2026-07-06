import { createPrivateTool } from "@decocms/runtime/tools";
import { z } from "zod";
import { dataApi } from "../lib/yt-client.ts";
import type { Env } from "../types/env.ts";

export const createSearchMyVideosTool = (env: Env) =>
  createPrivateTool({
    id: "YOUTUBE_ADMIN_SEARCH_MY_VIDEOS",
    description:
      "Search within the channel's own videos. More flexible than listing the uploads playlist — supports text search, date range, order, and type filters. Quota: 100 units.",
    inputSchema: z.object({
      query: z.string().optional().describe("Search text"),
      type: z.enum(["video", "live", "completed", "upcoming"]).default("video"),
      order: z
        .enum(["date", "rating", "relevance", "title", "viewCount"])
        .default("date"),
      publishedAfter: z
        .string()
        .optional()
        .describe("ISO 8601 datetime e.g. 2026-01-01T00:00:00Z"),
      publishedBefore: z.string().optional().describe("ISO 8601 datetime"),
      maxResults: z.coerce.number().int().min(1).max(50).default(25),
      pageToken: z.string().optional(),
    }),
    outputSchema: z.object({
      results: z.array(
        z.object({
          videoId: z.string(),
          title: z.string(),
          publishedAt: z.string().optional(),
          thumbnailUrl: z.string().optional(),
          liveBroadcastContent: z.string().optional(),
        }),
      ),
      nextPageToken: z.string().optional(),
      totalResults: z.number().optional(),
    }),
    execute: async ({ context }) => {
      const data = await dataApi<{
        items?: Array<{
          id?: { videoId?: string };
          snippet?: {
            title?: string;
            publishedAt?: string;
            thumbnails?: { medium?: { url?: string } };
            liveBroadcastContent?: string;
          };
        }>;
        nextPageToken?: string;
        pageInfo?: { totalResults?: number };
      }>(env, "/search", {
        params: {
          part: "snippet",
          forMine: true,
          type: "video",
          eventType: context.type !== "video" ? context.type : undefined,
          q: context.query,
          order: context.order,
          publishedAfter: context.publishedAfter,
          publishedBefore: context.publishedBefore,
          maxResults: context.maxResults,
          pageToken: context.pageToken,
        },
      });

      const results = (data.items ?? []).map((item) => ({
        videoId: item.id?.videoId ?? "",
        title: item.snippet?.title ?? "",
        publishedAt: item.snippet?.publishedAt,
        thumbnailUrl: item.snippet?.thumbnails?.medium?.url,
        liveBroadcastContent: item.snippet?.liveBroadcastContent,
      }));

      return {
        results,
        nextPageToken: data.nextPageToken,
        totalResults: data.pageInfo?.totalResults,
      };
    },
  });
