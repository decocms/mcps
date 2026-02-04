import type { Env } from "../types/env.ts";
import { getClientFromEnv } from "../lib/dataforseo.ts";
import { createPrivateTool } from "@decocms/runtime/tools";
import {
  searchVolumeInputSchema,
  searchVolumeOutputSchema,
  relatedKeywordsInputSchema,
  relatedKeywordsOutputSchema,
} from "./schemas.ts";

export const createSearchVolumeTool = (env: Env) =>
  createPrivateTool({
    id: "DATAFORSEO_GET_SEARCH_VOLUME",
    description:
      "Get search volume, CPC, and competition data for keywords. Returns detailed metrics including monthly search trends.",
    inputSchema: searchVolumeInputSchema,
    outputSchema: searchVolumeOutputSchema,
    execute: async ({ context }) => {
      const client = getClientFromEnv(env);
      const result = await client.getSearchVolume(
        context.keywords,
        context.languageName,
        context.locationName,
        context.languageCode,
        context.locationCode,
      );
      return { data: result };
    },
  });

export const createRelatedKeywordsTool = (env: Env) =>
  createPrivateTool({
    id: "DATAFORSEO_GET_RELATED_KEYWORDS",
    description:
      "Get keyword suggestions related to a seed keyword. Returns related terms with search volume and competition data.",
    inputSchema: relatedKeywordsInputSchema,
    outputSchema: relatedKeywordsOutputSchema,
    execute: async ({ context }) => {
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
      return { data: result };
    },
  });

export const keywordTools = [createSearchVolumeTool, createRelatedKeywordsTool];
