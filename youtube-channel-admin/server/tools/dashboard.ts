import { createTool } from "@decocms/runtime/tools";
import { z } from "zod";
import { DASHBOARD_RESOURCE_URI } from "../constants.ts";
import {
  getAlerts,
  getMyChannel,
  getPerformance,
  getTopVideos,
  listMyVideos,
} from "../lib/yt-data.ts";
import type { Env } from "../types/env.ts";
import {
  AlertCountsSchema,
  ChannelAlertSchema,
  MyChannelSchema,
  MyVideoSchema,
  PerformanceSchema,
  TopVideoSchema,
} from "./views.ts";

export const createDashboardTool = (env: Env) =>
  createTool({
    id: "YOUTUBE_ADMIN_DASHBOARD",
    description:
      "Open the YouTube channel dashboard: 28-day performance, top videos, alerts (upload/processing problems, moderation queue) and recent uploads.",
    inputSchema: z.object({}),
    outputSchema: z.object({
      channel: MyChannelSchema,
      performance: PerformanceSchema,
      topVideos: z.array(TopVideoSchema),
      alerts: z.array(ChannelAlertSchema),
      alertCounts: AlertCountsSchema,
      recentVideos: z.array(MyVideoSchema),
      updatedAt: z.string(),
    }),
    _meta: { ui: { resourceUri: DASHBOARD_RESOURCE_URI } },
    annotations: { readOnlyHint: true },
    execute: async () => {
      const [channel, performance, top, alerts, recent] = await Promise.all([
        getMyChannel(env),
        getPerformance(env, { days: 28 }),
        getTopVideos(env, { days: 28, limit: 5 }),
        getAlerts(env),
        listMyVideos(env, { maxResults: 10 }),
      ]);
      return {
        channel,
        performance,
        topVideos: top.topVideos,
        alerts: alerts.alerts,
        alertCounts: alerts.counts,
        recentVideos: recent.videos,
        updatedAt: new Date().toISOString(),
      };
    },
  });
