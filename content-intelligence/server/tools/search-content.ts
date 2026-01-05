/**
 * Tool: Search Content
 *
 * Search and filter aggregated content from all configured sources.
 * Sources are configured via StateSchema at installation time.
 *
 * @module tools/search-content
 * @version 1.0.0
 */

import { createPrivateTool } from "@decocms/runtime/mastra";
import type { Env } from "../main.ts";
import {
  SearchContentInputSchema,
  SearchContentOutputSchema,
} from "../domain/schemas.ts";

/**
 * Creates the search_content MCP tool.
 *
 * Access to configured sources comes from:
 * env.DECO_CHAT_REQUEST_CONTEXT.state.sources
 *
 * This follows the same pattern as readonly-sql accessing:
 * env.DECO_CHAT_REQUEST_CONTEXT.state.connectionString
 */
export const createSearchContentTool = (env: Env) =>
  createPrivateTool({
    id: "SEARCH_CONTENT",
    description:
      "Search through aggregated content from configured sources (RSS feeds, Reddit, web scrapers). " +
      "Supports free text search, filtering by categories, source types, tags, and relevance scores. " +
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

      // Access state from request context (same pattern as readonly-sql)
      const state = env.DECO_CHAT_REQUEST_CONTEXT.state;
      const configuredSources = state.sources || [];

      // Filter sources by enabled status and type
      const activeSources = configuredSources.filter(
        (source: { enabled: boolean; type: string }) => {
          if (!source.enabled) return false;
          if (sourceTypes && !sourceTypes.includes(source.type)) return false;
          return true;
        },
      );

      console.log("[SEARCH_CONTENT] Searching with params:", {
        query,
        categories,
        sourceTypes,
        tags,
        minRelevanceScore,
        daysBack,
        limit,
        excludeDuplicates,
        configuredSourcesCount: configuredSources.length,
        activeSourcesCount: activeSources.length,
      });

      // TODO: Implement actual search logic using activeSources
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
