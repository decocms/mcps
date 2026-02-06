import type { Env } from "../types/env.ts";
import { logToolExecution, logToolSuccess } from "./_helpers.ts";
import { getClientFromEnv } from "../lib/dataforseo.ts";
import { createPrivateTool } from "@decocms/runtime/tools";
import {
  keywordSuggestionsInputSchema,
  keywordSuggestionsOutputSchema,
  keywordIdeasInputSchema,
  keywordIdeasOutputSchema,
} from "./schemas.ts";

export const createKeywordSuggestionsTool = (env: Env) =>
  createPrivateTool({
    id: "DATAFORSEO_KEYWORD_SUGGESTIONS",
    description:
      "[ASYNC] Get keyword suggestions from Google Autocomplete with search volume data. Returns actual suggestions that users see when typing in Google search. Perfect for discovering long-tail keywords and understanding user search intent. Response time: 2-5 seconds. Cost: ~0.003 credits per request (extremely affordable!).",
    inputSchema: keywordSuggestionsInputSchema,
    outputSchema: keywordSuggestionsOutputSchema,
    execute: async ({ context }) => {
      logToolExecution("DATAFORSEO_KEYWORD_SUGGESTIONS", env);
      const client = getClientFromEnv(env);
      const result = await client.getKeywordSuggestions(
        context.keyword,
        context.languageName,
        context.locationName,
        context.languageCode,
        context.locationCode,
        context.limit,
      );
      logToolSuccess("DATAFORSEO_KEYWORD_SUGGESTIONS");
      return { data: result };
    },
  });

export const createKeywordIdeasTool = (env: Env) =>
  createPrivateTool({
    id: "DATAFORSEO_KEYWORD_IDEAS",
    description:
      "[ASYNC] Get keyword ideas based on 1-5 seed keywords using Google's internal keyword matching algorithm. Returns related keywords with search volume, competition level, and CPC data. Alternative to Related Keywords with different matching logic. Response time: 3-8 seconds. Cost: ~0.003 credits per request (very cheap alternative to Related Keywords!).",
    inputSchema: keywordIdeasInputSchema,
    outputSchema: keywordIdeasOutputSchema,
    execute: async ({ context }) => {
      logToolExecution("DATAFORSEO_KEYWORD_IDEAS", env);
      const client = getClientFromEnv(env);
      const result = await client.getKeywordIdeas(
        context.keywords,
        context.languageName,
        context.locationName,
        context.languageCode,
        context.locationCode,
        context.limit,
      );
      logToolSuccess("DATAFORSEO_KEYWORD_IDEAS");
      return { data: result };
    },
  });

export const keywordSuggestionsTools = [
  createKeywordSuggestionsTool,
  createKeywordIdeasTool,
];
