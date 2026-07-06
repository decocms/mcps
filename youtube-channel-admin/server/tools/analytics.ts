import { createPrivateTool } from "@decocms/runtime/tools";
import { z } from "zod";
import { analyticsApi } from "../lib/yt-client.ts";
import type { Env } from "../types/env.ts";

export const createQueryAnalyticsTool = (env: Env) =>
  createPrivateTool({
    id: "YOUTUBE_ADMIN_QUERY_ANALYTICS",
    description:
      "Run a YouTube Analytics report for the authorized channel (Analytics API v2). Pick metrics like views, estimatedMinutesWatched, averageViewDuration, likes, comments, shares, subscribersGained; dimensions like day, video, country, trafficSourceType; filters like video==VIDEO_ID.",
    inputSchema: z.object({
      startDate: z
        .string()
        .regex(/^\d{4}-\d{2}-\d{2}$/)
        .describe("YYYY-MM-DD"),
      endDate: z
        .string()
        .regex(/^\d{4}-\d{2}-\d{2}$/)
        .describe("YYYY-MM-DD"),
      metrics: z
        .string()
        .default(
          "views,estimatedMinutesWatched,averageViewDuration,likes,comments,subscribersGained",
        )
        .describe("Comma-separated metric list"),
      dimensions: z
        .string()
        .optional()
        .describe(
          'Comma-separated dimensions (e.g. "day", "video", "country")',
        ),
      filters: z
        .string()
        .optional()
        .describe('e.g. "video==dQw4w9WgXcQ" or "country==BR"'),
      sort: z
        .string()
        .optional()
        .describe('Comma-separated sort fields, "-" prefix for descending'),
      maxResults: z.coerce.number().int().min(1).max(200).optional(),
    }),
    outputSchema: z.object({
      columnHeaders: z.array(
        z.object({
          name: z.string(),
          columnType: z.string(),
          dataType: z.string(),
        }),
      ),
      rows: z.array(z.array(z.union([z.string(), z.number()]))),
    }),
    execute: async ({ context }) => {
      const report = await analyticsApi(env, {
        startDate: context.startDate,
        endDate: context.endDate,
        metrics: context.metrics,
        dimensions: context.dimensions,
        filters: context.filters,
        sort: context.sort,
        maxResults: context.maxResults,
      });
      return {
        columnHeaders: report.columnHeaders ?? [],
        rows: report.rows ?? [],
      };
    },
  });
