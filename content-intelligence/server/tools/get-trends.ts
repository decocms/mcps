/**
 * Tool: Get Trends
 *
 * Analyze content to identify emerging trends, hot topics,
 * and patterns across sources.
 *
 * @module tools/get-trends
 * @version 1.0.0
 */

import { createPrivateTool } from "@decocms/runtime/mastra";
import type { Env } from "../main.ts";
import {
  GetTrendsInputSchema,
  GetTrendsOutputSchema,
} from "../domain/schemas.ts";

/**
 * Creates the get_trends MCP tool.
 *
 * Uses state.categoriesOfInterest for filtering relevant trends.
 */
export const createGetTrendsTool = (env: Env) =>
  createPrivateTool({
    id: "GET_TRENDS",
    description:
      "Analyze aggregated content to identify emerging trends, hot topics, and patterns. " +
      "Returns a list of trends with momentum indicators (rising/stable/declining), " +
      "related content, and confidence scores.",
    inputSchema: GetTrendsInputSchema,
    outputSchema: GetTrendsOutputSchema,
    execute: async ({
      context,
    }: {
      context: {
        daysBack?: number;
        categories?: string[];
        limit?: number;
      };
    }) => {
      const { daysBack = 7, categories, limit = 10 } = context;

      // Access configuration from state
      const state = env.DECO_CHAT_REQUEST_CONTEXT.state;
      const sources = state.sources || [];
      const defaultCategories = state.categoriesOfInterest || [];

      // Use provided categories or fall back to configured ones
      const targetCategories = categories || defaultCategories;

      console.log("[GET_TRENDS] Analyzing trends:", {
        daysBack,
        categories: targetCategories,
        limit,
        sourcesCount: sources.length,
      });

      const now = new Date();
      const periodStart = new Date(now);
      periodStart.setDate(now.getDate() - daysBack);

      // TODO: Implement trend analysis
      return {
        trends: [],
        periodStart: periodStart.toISOString(),
        periodEnd: now.toISOString(),
        totalContentAnalyzed: 0,
      };
    },
  });
