import { createPrivateTool } from "@decocms/runtime/tools";
import { z } from "zod";
import { dataApi } from "../lib/yt-client.ts";
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
