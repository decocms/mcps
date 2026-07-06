/**
 * Home widgets (deco CMS home screen) — same MCP-App pattern as
 * tanstack-migrator: small cards backed by read-only tools whose
 * _meta.ui.resourceUri points at the built HTML bundle.
 */
import { createTool } from "@decocms/runtime/tools";
import { z } from "zod";
import {
  WIDGET_ALERTS_RESOURCE_URI,
  WIDGET_PERFORMANCE_RESOURCE_URI,
  WIDGET_TOP_VIDEOS_RESOURCE_URI,
} from "../constants.ts";
import {
  getAlerts,
  getMyChannel,
  getPerformance,
  getTopVideos,
} from "../lib/yt-data.ts";
import type { Env } from "../types/env.ts";
import {
  AlertCountsSchema,
  ChannelAlertSchema,
  PerformanceSchema,
  TopVideoSchema,
} from "./views.ts";

export const createTopVideosWidgetTool = (env: Env) =>
  createTool({
    id: "YOUTUBE_ADMIN_WIDGET_TOP_VIDEOS",
    description:
      "Home widget: the channel's best performing videos in the last 28 days (views, watch time, likes).",
    inputSchema: z.object({}),
    outputSchema: z.object({
      topVideos: z.array(TopVideoSchema),
      startDate: z.string(),
      endDate: z.string(),
      updatedAt: z.string(),
    }),
    _meta: { ui: { resourceUri: WIDGET_TOP_VIDEOS_RESOURCE_URI } },
    annotations: { readOnlyHint: true },
    execute: async () => ({
      ...(await getTopVideos(env, { days: 28, limit: 5 })),
      updatedAt: new Date().toISOString(),
    }),
  });

export const createPerformanceWidgetTool = (env: Env) =>
  createTool({
    id: "YOUTUBE_ADMIN_WIDGET_PERFORMANCE",
    description:
      "Home widget: 28-day channel performance — views, watch time, likes, comments, subscriber gains, plus a daily views sparkline.",
    inputSchema: z.object({}),
    outputSchema: z.object({
      performance: PerformanceSchema,
      channel: z.object({
        title: z.string(),
        subscriberCount: z.number(),
        thumbnailUrl: z.string().optional(),
      }),
      updatedAt: z.string(),
    }),
    _meta: { ui: { resourceUri: WIDGET_PERFORMANCE_RESOURCE_URI } },
    annotations: { readOnlyHint: true },
    execute: async () => {
      const [performance, channel] = await Promise.all([
        getPerformance(env, { days: 28 }),
        getMyChannel(env),
      ]);
      return {
        performance,
        channel: {
          title: channel.title,
          subscriberCount: channel.subscriberCount,
          thumbnailUrl: channel.thumbnailUrl,
        },
        updatedAt: new Date().toISOString(),
      };
    },
  });

export const createAlertsWidgetTool = (env: Env) =>
  createTool({
    id: "YOUTUBE_ADMIN_WIDGET_ALERTS",
    description:
      "Home widget: alerts for videos with problems — failed/rejected uploads (incl. copyright rejections), processing errors/warnings — and comments held for review.",
    inputSchema: z.object({}),
    outputSchema: z.object({
      alerts: z.array(ChannelAlertSchema),
      counts: AlertCountsSchema,
      updatedAt: z.string(),
    }),
    _meta: { ui: { resourceUri: WIDGET_ALERTS_RESOURCE_URI } },
    annotations: { readOnlyHint: true },
    execute: async () => ({
      ...(await getAlerts(env)),
      updatedAt: new Date().toISOString(),
    }),
  });
