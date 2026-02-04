import type { Env } from "../types/env.ts";
import { getClientFromEnv } from "../lib/dataforseo.ts";
import { createPrivateTool } from "@decocms/runtime/tools";
import {
  organicSerpInputSchema,
  organicSerpOutputSchema,
  newsSerpInputSchema,
  newsSerpOutputSchema,
  historicalSerpInputSchema,
  historicalSerpOutputSchema,
} from "./schemas.ts";

export const createOrganicSerpTool = (env: Env) =>
  createPrivateTool({
    id: "DATAFORSEO_GET_ORGANIC_SERP",
    description:
      "[ASYNC - Live SERP] Get real-time organic search results from Google. Returns detailed SERP data including rankings, URLs, titles, descriptions, and SERP features (featured snippets, knowledge panels, etc.). Specify device (desktop/mobile) and depth (number of results). Takes 3-8 seconds for live results. Cost: ~0.003 credits per request. Available in all plans.",
    inputSchema: organicSerpInputSchema,
    outputSchema: organicSerpOutputSchema,
    execute: async ({ context }) => {
      const client = getClientFromEnv(env);
      const result = await client.getOrganicSerpLive(
        context.keyword,
        context.languageCode,
        context.locationCode,
        context.device,
        context.depth,
      );
      return { data: result };
    },
  });

export const createNewsSerpTool = (env: Env) =>
  createPrivateTool({
    id: "DATAFORSEO_GET_NEWS_SERP",
    description:
      "[ASYNC - Live SERP] Get real-time Google News results for a keyword. Returns news articles with titles, sources, timestamps, snippets, and thumbnail images. Filter by time range (1h, 1d, 1w, 1m, 1y) and sort by relevance or date. Takes 2-5 seconds. Cost: ~0.003 credits per request. Available in all plans.",
    inputSchema: newsSerpInputSchema,
    outputSchema: newsSerpOutputSchema,
    execute: async ({ context }) => {
      const client = getClientFromEnv(env);
      const result = await client.getNewsSerpLive(
        context.keyword,
        context.languageCode,
        context.locationCode,
        context.sortBy,
        context.timeRange,
      );
      return { data: result };
    },
  });

export const createHistoricalSerpTool = (env: Env) =>
  createPrivateTool({
    id: "DATAFORSEO_HISTORICAL_SERP",
    description:
      "[ASYNC - DataForSEO Labs] Get historical SERP ranking data for a keyword over time. Shows how rankings changed for top domains, useful for analyzing algorithm updates, seasonal trends, and SERP volatility. Supports custom date ranges (default: last 30 days). Response time: 5-12 seconds. Cost: ~0.05 credits per request (valuable for trend analysis!).",
    inputSchema: historicalSerpInputSchema,
    outputSchema: historicalSerpOutputSchema,
    execute: async ({ context }) => {
      const client = getClientFromEnv(env);
      const result = await client.getHistoricalSerp(
        context.keyword,
        context.languageName,
        context.locationName,
        context.languageCode,
        context.locationCode,
        context.dateFrom,
        context.dateTo,
      );
      return { data: result };
    },
  });

export const serpTools = [
  createOrganicSerpTool,
  createNewsSerpTool,
  createHistoricalSerpTool,
];
