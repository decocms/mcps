import type { Env } from "../types/env.ts";
import { getClientFromEnv } from "../lib/dataforseo.ts";
import { createPrivateTool } from "@decocms/runtime/tools";
import {
  organicSerpInputSchema,
  organicSerpOutputSchema,
  newsSerpInputSchema,
  newsSerpOutputSchema,
} from "./schemas.ts";

export const createOrganicSerpTool = (env: Env) =>
  createPrivateTool({
    id: "DATAFORSEO_GET_ORGANIC_SERP",
    description:
      "Get organic search results from Google SERP. Returns detailed SERP data including rankings, URLs, titles, and descriptions.",
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
      "Get Google News search results. Returns news articles with titles, sources, timestamps, and snippets.",
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

export const serpTools = [createOrganicSerpTool, createNewsSerpTool];
