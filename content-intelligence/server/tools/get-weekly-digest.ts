/**
 * Tool: Get Weekly Digest
 *
 * Retrieve the weekly content digest with executive summaries,
 * categorized highlights, and trend analysis.
 *
 * @module tools/get-weekly-digest
 * @version 1.0.0
 */

import { createPrivateTool } from "@decocms/runtime/mastra";
import type { Env } from "../main.ts";
import { parseSourcesFromState, parseTopicsFromState } from "../main.ts";
import {
  GetWeeklyDigestInputSchema,
  GetWeeklyDigestOutputSchema,
} from "../domain/schemas.ts";

/**
 * Creates the get_weekly_digest MCP tool.
 */
export const createGetWeeklyDigestTool = (env: Env) =>
  createPrivateTool({
    id: "GET_WEEKLY_DIGEST",
    description:
      "Get the weekly content digest containing an executive summary, categorized highlights, " +
      "and trend analysis. Digests are pre-generated and provide a curated overview of the most " +
      "relevant content from all configured sources.",
    inputSchema: GetWeeklyDigestInputSchema,
    outputSchema: GetWeeklyDigestOutputSchema,
    execute: async ({
      context,
    }: {
      context: {
        weekOffset?: number;
        includeFullContent?: boolean;
      };
    }) => {
      const { weekOffset = 0, includeFullContent = false } = context;

      // Parse configuration from state
      const state = env.DECO_CHAT_REQUEST_CONTEXT.state;
      const sources = parseSourcesFromState(state);
      const topics = parseTopicsFromState(state);

      console.log("[GET_WEEKLY_DIGEST] Config:", {
        weekOffset,
        includeFullContent,
        sourcesCount: sources.length,
        topics,
      });

      // Calculate period dates
      const now = new Date();
      const startOfWeek = new Date(now);
      startOfWeek.setDate(now.getDate() - now.getDay() - weekOffset * 7);
      startOfWeek.setHours(0, 0, 0, 0);

      const endOfWeek = new Date(startOfWeek);
      endOfWeek.setDate(startOfWeek.getDate() + 6);
      endOfWeek.setHours(23, 59, 59, 999);

      // TODO: Implement digest retrieval from storage
      return {
        digest: null,
        message:
          `No digest available for the week of ${startOfWeek.toISOString().split("T")[0]}. ` +
          `Configured sources: ${sources.length}. ` +
          "Digests are generated weekly by the scheduled job.",
      };
    },
  });
