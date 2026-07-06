import { createPrivateTool } from "@decocms/runtime/tools";
import { z } from "zod";
import { getInnertube, wrapInnertubeError } from "../lib/innertube.ts";
import type { Env } from "../types/env.ts";

const SearchResultSchema = z.object({
  kind: z.enum(["video", "channel", "playlist"]),
  videoId: z.string().optional(),
  channelId: z.string().optional(),
  playlistId: z.string().optional(),
  title: z.string(),
  channelName: z.string().optional(),
  description: z.string().optional(),
  publishedText: z.string().optional(),
  viewCountText: z.string().optional(),
  subscriberCountText: z.string().optional(),
  videoCountText: z.string().optional(),
  durationSeconds: z.number().optional(),
  thumbnailUrl: z.string().optional(),
  isLive: z.boolean().optional(),
  url: z.string(),
});

type SearchResult = z.infer<typeof SearchResultSchema>;

const text = (value: unknown): string | undefined => {
  if (value == null) return undefined;
  if (typeof value === "string") return value || undefined;
  const t = (value as { toString?: () => string }).toString?.();
  return t && t !== "[object Object]" ? t : undefined;
};

// deno-lint-ignore no-explicit-any
function mapNode(node: any): SearchResult | null {
  const type: string = node?.type ?? "";
  const thumbnailUrl: string | undefined =
    node?.thumbnails?.[0]?.url ??
    node?.thumbnail?.[0]?.url ??
    node?.author?.thumbnails?.[0]?.url;

  if (
    type === "Video" ||
    type === "CompactVideo" ||
    type === "ShortsLockupView"
  ) {
    const videoId: string | undefined = node?.id ?? node?.video_id;
    if (!videoId) return null;
    return {
      kind: "video",
      videoId,
      channelId: node?.author?.id,
      title: text(node?.title) ?? "",
      channelName: node?.author?.name,
      description:
        text(node?.description_snippet) ?? text(node?.snippets?.[0]?.text),
      publishedText: text(node?.published),
      viewCountText: text(node?.view_count) ?? text(node?.short_view_count),
      durationSeconds:
        typeof node?.duration?.seconds === "number"
          ? node.duration.seconds
          : undefined,
      thumbnailUrl,
      isLive: node?.is_live ?? undefined,
      url: `https://www.youtube.com/watch?v=${videoId}`,
    };
  }

  if (type === "Channel" || type === "ChannelCard") {
    const channelId: string | undefined = node?.id ?? node?.author?.id;
    if (!channelId) return null;
    return {
      kind: "channel",
      channelId,
      title: text(node?.author?.name) ?? text(node?.title) ?? "",
      description: text(node?.description_snippet),
      subscriberCountText:
        text(node?.subscriber_count) ?? text(node?.video_count),
      thumbnailUrl,
      url: `https://www.youtube.com/channel/${channelId}`,
    };
  }

  if (type === "Playlist" || type === "LockupView" || type === "GridPlaylist") {
    const playlistId: string | undefined = node?.id ?? node?.content_id;
    if (!playlistId) return null;
    return {
      kind: "playlist",
      playlistId,
      title: text(node?.title) ?? "",
      channelName: node?.author?.name,
      videoCountText: text(node?.video_count) ?? text(node?.video_count_short),
      thumbnailUrl,
      url: `https://www.youtube.com/playlist?list=${playlistId}`,
    };
  }

  return null;
}

export const createSearchVideosTool = (_env: Env) =>
  createPrivateTool({
    id: "YOUTUBE_SEARCH_VIDEOS",
    description:
      "Search YouTube for videos, channels or playlists — no API key needed. Supports sorting and upload-date/duration filters. Returns titles, channel, view counts, duration and thumbnails; use YOUTUBE_GET_VIDEO_DETAILS for full metadata of a specific video.",
    inputSchema: z.object({
      query: z.string().min(1).describe("Search query"),
      limit: z.coerce
        .number()
        .int()
        .min(1)
        .max(50)
        .default(20)
        .describe("Max results to return (1-50, default 20)"),
      type: z
        .enum(["video", "shorts", "channel", "playlist", "all"])
        .default("video")
        .describe("Result type filter (default video)"),
      prioritize: z
        .enum(["relevance", "popularity"])
        .default("relevance")
        .describe("Ranking preference"),
      uploadDate: z
        .enum(["all", "today", "week", "month", "year"])
        .optional()
        .describe("Only return videos uploaded within this window"),
      duration: z
        .enum(["all", "short", "medium", "long"])
        .optional()
        .describe(
          "Video duration filter: short (<3min), medium (3-20min), long (>20min)",
        ),
    }),
    outputSchema: z.object({
      results: z.array(SearchResultSchema),
      count: z.number(),
    }),
    execute: async ({ context }) => {
      const yt = await getInnertube();

      const durationMap = {
        all: "all",
        short: "under_three_mins",
        medium: "three_to_twenty_mins",
        long: "over_twenty_mins",
      } as const;

      let search;
      try {
        search = await yt.search(context.query, {
          type: context.type,
          prioritize: context.prioritize,
          upload_date: context.uploadDate ?? "all",
          duration: durationMap[context.duration ?? "all"],
        });
      } catch (error) {
        throw wrapInnertubeError(error);
      }

      const results: SearchResult[] = [];
      const seen = new Set<string>();
      let page: typeof search | null = search;

      while (page && results.length < context.limit) {
        for (const node of page.results ?? []) {
          const mapped = mapNode(node);
          if (!mapped) continue;
          const key =
            mapped.videoId ?? mapped.channelId ?? mapped.playlistId ?? "";
          if (!key || seen.has(key)) continue;
          seen.add(key);
          results.push(mapped);
          if (results.length >= context.limit) break;
        }
        if (results.length >= context.limit || !page.has_continuation) break;
        try {
          page = await page.getContinuation();
        } catch {
          break;
        }
      }

      return { results, count: results.length };
    },
  });
