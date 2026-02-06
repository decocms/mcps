import type { Env } from "../types/env.ts";
import { getClientFromEnv } from "../lib/dataforseo.ts";
import { createPrivateTool } from "@decocms/runtime/tools";
import {
  searchVolumeInputSchema,
  searchVolumeOutputSchema,
  relatedKeywordsInputSchema,
  relatedKeywordsOutputSchema,
} from "./schemas.ts";
import { logToolExecution, logToolSuccess } from "./_helpers.ts";

export const createSearchVolumeTool = (env: Env) =>
  createPrivateTool({
    id: "DATAFORSEO_GET_SEARCH_VOLUME",
    description:
      "[ASYNC] Get search volume, CPC, and competition data for up to 1000 keywords at once. Returns detailed metrics including monthly search trends, competition level, and cost-per-click. This is a live API call that takes 2-5 seconds. Available in all DataForSEO plans. Cost: ~0.002 credits per keyword.",
    inputSchema: searchVolumeInputSchema,
    outputSchema: searchVolumeOutputSchema,
    execute: async ({ context }) => {
      logToolExecution("DATAFORSEO_GET_SEARCH_VOLUME", env);
      const client = getClientFromEnv(env);
      const result = await client.getSearchVolume(
        context.keywords,
        context.languageName,
        context.locationName,
        context.languageCode,
        context.locationCode,
      );
      logToolSuccess("DATAFORSEO_GET_SEARCH_VOLUME");
      return { data: result };
    },
  });

export const createRelatedKeywordsTool = (env: Env) =>
  createPrivateTool({
    id: "DATAFORSEO_GET_RELATED_KEYWORDS",
    description:
      "[ASYNC - DataForSEO Labs] Get keyword suggestions related to a seed keyword with semantic and contextual relationships. Returns up to 1000 related terms with search volume, competition, and SERP data. This uses DataForSEO Labs API which may have higher costs. Takes 3-10 seconds depending on depth parameter. Cost: ~0.1 credits per request.",
    inputSchema: relatedKeywordsInputSchema,
    outputSchema: relatedKeywordsOutputSchema,
    execute: async ({ context }) => {
      logToolExecution("DATAFORSEO_GET_RELATED_KEYWORDS", env);
      const client = getClientFromEnv(env);
      const result = await client.getRelatedKeywords(
        context.keyword,
        context.locationName,
        context.languageName,
        context.locationCode,
        context.languageCode,
        context.depth,
        context.limit,
      );
      logToolSuccess("DATAFORSEO_GET_RELATED_KEYWORDS");
      return { data: result };
    },
  });

export const keywordTools = [createSearchVolumeTool, createRelatedKeywordsTool];
