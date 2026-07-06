import { createPrivateTool } from "@decocms/runtime/tools";
import { z } from "zod";
import { UPLOAD_API_BASE } from "../constants.ts";
import { dataApi, googleFetch } from "../lib/yt-client.ts";
import { getMyChannel } from "../lib/yt-data.ts";
import type { Env } from "../types/env.ts";
import { MyChannelSchema } from "./views.ts";

export const createGetMyChannelTool = (env: Env) =>
  createPrivateTool({
    id: "YOUTUBE_ADMIN_GET_MY_CHANNEL",
    description:
      "Get the authorized user's YouTube channel: title, subscriber/view/video counts and the uploads playlist id.",
    inputSchema: z.object({}),
    outputSchema: MyChannelSchema,
    execute: async () => getMyChannel(env),
  });

export const createUpdateChannelTool = (env: Env) =>
  createPrivateTool({
    id: "YOUTUBE_ADMIN_UPDATE_CHANNEL",
    description:
      "Update the channel's branding: description, keywords, country and default language. Note: the channel title (name) is tied to the Google account and cannot be changed via the API.",
    inputSchema: z.object({
      description: z
        .string()
        .max(1000)
        .optional()
        .describe("Channel description (shown on the About page)"),
      keywords: z
        .array(z.string())
        .optional()
        .describe("Channel keywords for search"),
      country: z
        .string()
        .length(2)
        .optional()
        .describe("ISO 3166-1 alpha-2 country code (e.g. BR, US)"),
      defaultLanguage: z
        .string()
        .optional()
        .describe('BCP-47 language code (e.g. "pt", "en")'),
    }),
    outputSchema: z.object({
      channelId: z.string(),
      description: z.string().optional(),
      keywords: z.array(z.string()).optional(),
      country: z.string().optional(),
      defaultLanguage: z.string().optional(),
    }),
    execute: async ({ context }) => {
      // Fetch current channel to get the id
      const channel = await getMyChannel(env);

      // channels.update requires the full brandingSettings object
      const current = await dataApi<{
        items?: Array<{
          brandingSettings?: {
            channel?: {
              description?: string;
              keywords?: string;
              country?: string;
              defaultLanguage?: string;
            };
          };
          snippet?: { defaultLanguage?: string };
        }>;
      }>(env, "/channels", {
        params: {
          part: "brandingSettings,snippet",
          id: channel.channelId,
        },
      });

      const existing = current.items?.[0]?.brandingSettings?.channel ?? {};
      const newKeywords =
        context.keywords !== undefined
          ? context.keywords.join(" ")
          : existing.keywords;

      const updated = await dataApi<{
        brandingSettings?: {
          channel?: {
            description?: string;
            keywords?: string;
            country?: string;
            defaultLanguage?: string;
          };
        };
      }>(env, "/channels", {
        method: "PUT",
        params: { part: "brandingSettings" },
        body: {
          id: channel.channelId,
          brandingSettings: {
            channel: {
              ...existing,
              ...(context.description !== undefined && {
                description: context.description,
              }),
              ...(newKeywords !== undefined && { keywords: newKeywords }),
              ...(context.country !== undefined && {
                country: context.country,
              }),
              ...(context.defaultLanguage !== undefined && {
                defaultLanguage: context.defaultLanguage,
              }),
            },
          },
        },
      });

      const ch = updated.brandingSettings?.channel ?? {};
      return {
        channelId: channel.channelId,
        description: ch.description,
        keywords: ch.keywords ? ch.keywords.split(" ").filter(Boolean) : [],
        country: ch.country,
        defaultLanguage: ch.defaultLanguage,
      };
    },
  });

export const createListVideoCategoryTool = (env: Env) =>
  createPrivateTool({
    id: "YOUTUBE_ADMIN_LIST_VIDEO_CATEGORIES",
    description:
      "List available YouTube video categories for a region. Useful for getting categoryId values for UPDATE_VIDEO.",
    inputSchema: z.object({
      regionCode: z
        .string()
        .length(2)
        .default("BR")
        .describe("ISO 3166-1 alpha-2 country code"),
    }),
    outputSchema: z.object({
      categories: z.array(
        z.object({
          id: z.string(),
          title: z.string(),
          assignable: z.boolean(),
        }),
      ),
    }),
    execute: async ({ context }) => {
      const data = await dataApi<{
        items?: Array<{
          id: string;
          snippet?: { title?: string; assignable?: boolean };
        }>;
      }>(env, "/videoCategories", {
        params: {
          part: "snippet",
          regionCode: context.regionCode,
          hl: "pt_BR",
        },
      });

      const categories = (data.items ?? [])
        .filter((item) => item.snippet?.assignable === true)
        .map((item) => ({
          id: item.id,
          title: item.snippet?.title ?? "",
          assignable: true,
        }))
        .sort((a, b) => a.id.localeCompare(b.id));

      return { categories };
    },
  });

export const createListSubscribersTool = (env: Env) =>
  createPrivateTool({
    id: "YOUTUBE_ADMIN_LIST_SUBSCRIBERS",
    description:
      "List the channel's most recent subscribers. Note: the YouTube API only returns subscribers who have made their subscriptions public.",
    inputSchema: z.object({
      maxResults: z.coerce.number().int().min(1).max(1000).default(50),
      pageToken: z.string().optional(),
    }),
    outputSchema: z.object({
      subscribers: z.array(
        z.object({
          subscriberChannelId: z.string(),
          subscriberTitle: z.string().optional(),
          subscriberThumbnailUrl: z.string().optional(),
          subscribedAt: z.string().optional(),
        }),
      ),
      nextPageToken: z.string().optional(),
    }),
    execute: async ({ context }) => {
      const data = await dataApi<{
        items?: Array<{
          snippet?: {
            subscriberSnippet?: {
              title?: string;
              thumbnails?: { default?: { url?: string } };
            };
            publishedAt?: string;
            resourceId?: { channelId?: string };
          };
        }>;
        nextPageToken?: string;
      }>(env, "/subscriptions", {
        params: {
          part: "snippet",
          mySubscribers: true,
          maxResults: context.maxResults,
          pageToken: context.pageToken,
        },
      });

      const subscribers = (data.items ?? []).map((item) => ({
        subscriberChannelId: item.snippet?.resourceId?.channelId ?? "",
        subscriberTitle: item.snippet?.subscriberSnippet?.title,
        subscriberThumbnailUrl:
          item.snippet?.subscriberSnippet?.thumbnails?.default?.url,
        subscribedAt: item.snippet?.publishedAt,
      }));

      return { subscribers, nextPageToken: data.nextPageToken };
    },
  });

const MAX_WATERMARK_BYTES = 1 * 1024 * 1024; // 1 MB API limit

export const createSetWatermarkTool = (env: Env) =>
  createPrivateTool({
    id: "YOUTUBE_ADMIN_SET_WATERMARK",
    description:
      "Set the channel watermark (branding overlay / subscribe button) shown on all videos. Provide an imageUrl (publicly accessible PNG/JPG, ≤1 MB). The watermark appears in the bottom-right corner by default. Use position.type='offset' with cornerPosition and offsetUnit for custom placement.",
    inputSchema: z.object({
      channelId: z.string().describe("Your channel's ID (from GET_MY_CHANNEL)"),
      imageUrl: z
        .string()
        .url()
        .describe("Public URL of a PNG or JPG image (≤1 MB)"),
      startTimeMs: z
        .number()
        .int()
        .min(0)
        .default(0)
        .describe("When the watermark starts appearing (ms into video)"),
      durationMs: z
        .number()
        .int()
        .min(0)
        .optional()
        .describe(
          "How long to show the watermark (ms); omit for rest of video",
        ),
      cornerPosition: z
        .enum(["topLeft", "topRight", "bottomLeft", "bottomRight"])
        .default("bottomRight")
        .describe("Corner where watermark appears"),
    }),
    outputSchema: z.object({ channelId: z.string(), set: z.boolean() }),
    execute: async ({ context }) => {
      const imgRes = await fetch(context.imageUrl);
      if (!imgRes.ok) {
        throw new Error(
          `Could not fetch watermark image from URL (${imgRes.status})`,
        );
      }
      const contentType = imgRes.headers.get("content-type") ?? "image/png";
      if (!/^image\/(jpeg|png)/.test(contentType)) {
        throw new Error(
          `Unsupported watermark content-type "${contentType}" — use JPEG or PNG.`,
        );
      }
      const imgBytes = new Uint8Array(await imgRes.arrayBuffer());
      if (imgBytes.byteLength > MAX_WATERMARK_BYTES) {
        throw new Error(
          `Watermark image is ${(imgBytes.byteLength / 1024 / 1024).toFixed(1)}MB — the API limit is 1MB.`,
        );
      }

      const invideoTiming: Record<string, unknown> = {
        type: "offsetFromStart",
        offsetMs: context.startTimeMs,
      };
      if (context.durationMs !== undefined) {
        invideoTiming.durationMs = context.durationMs;
      }

      const metadata = {
        position: {
          type: "corner",
          cornerPosition: context.cornerPosition,
        },
        timing: invideoTiming,
      };

      const boundary = "youtubeWatermarkBoundary";
      const metadataJson = JSON.stringify(metadata);
      const enc = new TextEncoder();
      const parts = [
        enc.encode(
          `--${boundary}\r\nContent-Type: application/json\r\n\r\n${metadataJson}\r\n`,
        ),
        enc.encode(`--${boundary}\r\nContent-Type: ${contentType}\r\n\r\n`),
        imgBytes,
        enc.encode(`\r\n--${boundary}--`),
      ];
      const totalLength = parts.reduce((s, p) => s + p.byteLength, 0);
      const combined = new Uint8Array(totalLength);
      let offset = 0;
      for (const p of parts) {
        combined.set(p, offset);
        offset += p.byteLength;
      }

      await googleFetch<void>(
        env,
        `${UPLOAD_API_BASE}/watermarks/set?uploadType=multipart&channelId=${encodeURIComponent(context.channelId)}`,
        {
          method: "POST",
          headers: {
            "Content-Type": `multipart/related; boundary=${boundary}`,
          },
          body: combined,
        },
      );

      return { channelId: context.channelId, set: true };
    },
  });

export const createUnsetWatermarkTool = (env: Env) =>
  createPrivateTool({
    id: "YOUTUBE_ADMIN_UNSET_WATERMARK",
    description: "Remove the channel watermark overlay.",
    inputSchema: z.object({
      channelId: z.string(),
    }),
    outputSchema: z.object({ channelId: z.string(), removed: z.boolean() }),
    execute: async ({ context }) => {
      await dataApi(env, "/watermarks/unset", {
        method: "POST",
        params: { channelId: context.channelId },
      });
      return { channelId: context.channelId, removed: true };
    },
  });
