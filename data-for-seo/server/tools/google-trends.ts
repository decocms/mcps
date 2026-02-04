import type { Env } from "../types/env.ts";
import { getClientFromEnv } from "../lib/dataforseo.ts";
import { createPrivateTool } from "@decocms/runtime/tools";
import {
  googleTrendsInputSchema,
  googleTrendsOutputSchema,
  keywordDifficultyInputSchema,
  keywordDifficultyOutputSchema,
} from "./schemas.ts";

export const createGoogleTrendsTool = (env: Env) =>
  createPrivateTool({
    id: "DATAFORSEO_GOOGLE_TRENDS",
    description:
      "[ASYNC] Get Google Trends data for up to 5 keywords including interest over time, regional interest, and related queries. Perfect for tracking keyword popularity trends and seasonal patterns. Response time: 3-8 seconds. Available in all DataForSEO plans. Cost: ~0.01 credits per request (very affordable!).",
    inputSchema: googleTrendsInputSchema,
    outputSchema: googleTrendsOutputSchema,
    execute: async ({ context }) => {
      const client = getClientFromEnv(env);
      const result = await client.getGoogleTrends(
        context.keywords,
        context.locationName,
        context.locationCode,
        context.timeRange,
        context.category,
      );
      return { data: result };
    },
  });

export const createKeywordDifficultyTool = (env: Env) =>
  createPrivateTool({
    id: "DATAFORSEO_KEYWORD_DIFFICULTY",
    description:
      "[ASYNC - DataForSEO Labs] Get keyword difficulty scores (0-100) for up to 100 keywords at once. Returns difficulty score, competitive metrics, and ranking data. Lower score = easier to rank. Response time: 3-10 seconds. Uses DataForSEO Labs API. Cost: ~0.05 credits per keyword (excellent value for competitive analysis!).",
    inputSchema: keywordDifficultyInputSchema,
    outputSchema: keywordDifficultyOutputSchema,
    execute: async ({ context }) => {
      const client = getClientFromEnv(env);
      const result = await client.getKeywordDifficulty(
        context.keywords,
        context.languageName,
        context.locationName,
        context.languageCode,
        context.locationCode,
      );
      return { data: result };
    },
  });

export const googleTrendsTools = [
  createGoogleTrendsTool,
  createKeywordDifficultyTool,
];
