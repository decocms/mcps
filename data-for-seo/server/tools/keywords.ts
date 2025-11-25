import type { Env } from "../main";
import { getClientFromEnv } from "../lib/dataforseo";
import { createPrivateTool } from "@decocms/runtime/mastra";
import {
  searchVolumeInputSchema,
  searchVolumeOutputSchema,
  relatedKeywordsInputSchema,
  relatedKeywordsOutputSchema,
} from "./schemas";

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
      "Get keyword suggestions related to seed keywords. Returns related terms with search volume and competition data.",
    inputSchema: relatedKeywordsInputSchema,
    outputSchema: relatedKeywordsOutputSchema,
    execute: async ({ context }) => {
      const client = getClientFromEnv(env);
      const result = await client.getRelatedKeywords(
        context.keywords,
        context.languageName,
        context.locationName,
        context.depth,
        context.limit,
      );
      return { data: result };
    },
  });

export const keywordTools = [createSearchVolumeTool, createRelatedKeywordsTool];
