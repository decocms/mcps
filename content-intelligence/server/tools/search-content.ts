/**
 * Tool: Search Content
 *
 * Search and filter aggregated content from all configured sources.
 *
 * @module tools/search-content
 * @version 1.0.0
 */

import { createPrivateTool } from "@decocms/runtime/mastra";
import type { Env } from "../main.ts";
import { parseSourcesFromState, parseTopicsFromState } from "../main.ts";
import {
  SearchContentInputSchema,
  SearchContentOutputSchema,
} from "../domain/schemas.ts";

/**
 * Creates the search_content MCP tool.
 */
export const createSearchContentTool = (env: Env) =>
  createPrivateTool({
    id: "SEARCH_CONTENT",
    description:
      "Search through aggregated content from configured sources (RSS feeds, Reddit). " +
      "Supports free text search, filtering by categories, source types, and relevance scores. " +
      "Returns normalized content with summaries and metadata.",
    inputSchema: SearchContentInputSchema,
    outputSchema: SearchContentOutputSchema,
    execute: async ({
      context,
    }: {
      context: {
        query?: string;
        categories?: string[];
        sourceTypes?: string[];
        tags?: string[];
        minRelevanceScore?: number;
        daysBack?: number;
        limit?: number;
        excludeDuplicates?: boolean;
      };
    }) => {
      const {
        query,
        categories,
        sourceTypes,
        tags,
        minRelevanceScore,
        daysBack = 7,
        limit = 20,
        excludeDuplicates = true,
      } = context;

      // Parse configuration from state
      const state = env.DECO_CHAT_REQUEST_CONTEXT.state;
      const sources = parseSourcesFromState(state);
      const configuredTopics = parseTopicsFromState(state);

      // Filter sources by type if specified
      const activeSources = sourceTypes
        ? sources.filter((s) => sourceTypes.includes(s.type))
        : sources;

      console.log("[SEARCH_CONTENT] Config:", {
        query,
        topics: categories || configuredTopics,
        sourceTypes,
        tags,
        minRelevanceScore: minRelevanceScore ?? state.minRelevanceScore,
        daysBack,
        limit,
        excludeDuplicates,
        sourcesCount: sources.length,
        activeSourcesCount: activeSources.length,
      });

      // TODO: Implement actual search logic
      // 1. Fetch from each source using connectors
      // 2. Apply filters
      // 3. Return normalized results

      return {
        results: [],
        total: 0,
        query: query,
      };
    },
  });
