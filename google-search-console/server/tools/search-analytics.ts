/**
 * Search Analytics Tools
 *
 * Tools for querying search analytics data
 */

import { createPrivateTool } from "@decocms/runtime/tools";
import { z } from "zod";
import type { Env } from "../main.ts";
import {
  SearchConsoleClient,
  getAccessToken,
} from "../lib/search-console-client.ts";
import {
  SEARCH_ANALYTICS_DIMENSIONS,
  DEFAULT_ROW_LIMIT,
  DEFAULT_START_ROW,
} from "../constants.ts";

// ============================================================================
// Schema Definitions
// ============================================================================

const SearchAnalyticsRowSchema = z.object({
  keys: z.array(z.string()).describe("Dimension values for this row"),
  clicks: z.number().describe("Number of clicks"),
  impressions: z.number().describe("Number of impressions"),
  ctr: z.number().describe("Click-through rate (clicks/impressions)"),
  position: z.number().describe("Average position in search results"),
});

// ============================================================================
// Query Search Analytics Tool
// ============================================================================

export const createQuerySearchAnalyticsTool = (env: Env) =>
  createPrivateTool({
    id: "query_search_analytics",
    description:
      "Query search analytics data (clicks, impressions, CTR, position) with filters by date, query, page, country, device, and search type",
    inputSchema: z.object({
      siteUrl: z
        .string()
        .describe(
          "Site URL (e.g., 'sc-domain:example.com' or 'https://example.com/')",
        ),
      startDate: z
        .string()
        .regex(/^\d{4}-\d{2}-\d{2}$/, "Date must be in YYYY-MM-DD format")
        .describe("Start date for the query (YYYY-MM-DD)"),
      endDate: z
        .string()
        .regex(/^\d{4}-\d{2}-\d{2}$/, "Date must be in YYYY-MM-DD format")
        .describe("End date for the query (YYYY-MM-DD)"),
      dimensions: z
        .array(
          z.enum([
            SEARCH_ANALYTICS_DIMENSIONS.DATE,
            SEARCH_ANALYTICS_DIMENSIONS.QUERY,
            SEARCH_ANALYTICS_DIMENSIONS.PAGE,
            SEARCH_ANALYTICS_DIMENSIONS.COUNTRY,
            SEARCH_ANALYTICS_DIMENSIONS.DEVICE,
            SEARCH_ANALYTICS_DIMENSIONS.SEARCH_APPEARANCE,
          ]),
        )
        .optional()
        .describe(
          "Dimensions to group results by (date, query, page, country, device, searchAppearance)",
        ),
      dimensionFilterGroups: z
        .array(
          z.object({
            groupType: z
              .enum(["and", "or"])
              .optional()
              .describe("Filter group type"),
            filters: z.array(
              z.object({
                dimension: z
                  .enum([
                    SEARCH_ANALYTICS_DIMENSIONS.QUERY,
                    SEARCH_ANALYTICS_DIMENSIONS.PAGE,
                    SEARCH_ANALYTICS_DIMENSIONS.COUNTRY,
                    SEARCH_ANALYTICS_DIMENSIONS.DEVICE,
                    SEARCH_ANALYTICS_DIMENSIONS.SEARCH_APPEARANCE,
                  ])
                  .describe("Dimension to filter by"),
                operator: z
                  .enum([
                    "equals",
                    "notEquals",
                    "contains",
                    "notContains",
                    "includingRegex",
                    "excludingRegex",
                  ])
                  .describe("Filter operator"),
                expression: z
                  .string()
                  .describe("Filter expression (value to match)"),
              }),
            ),
          }),
        )
        .optional()
        .describe("Filter groups to apply to the query"),
      rowLimit: z
        .number()
        .int()
        .min(1)
        .max(25000)
        .optional()
        .default(DEFAULT_ROW_LIMIT)
        .describe("Maximum number of rows to return (1-25000)"),
      startRow: z
        .number()
        .int()
        .min(0)
        .optional()
        .default(DEFAULT_START_ROW)
        .describe("Starting row index for pagination"),
      searchType: z
        .enum(["web", "image", "video", "news", "discover", "googleNews"])
        .optional()
        .describe("Type of search results to query"),
      aggregationType: z
        .enum(["auto", "byProperty", "byPage"])
        .optional()
        .describe("How to aggregate the results"),
    }),
    outputSchema: z.object({
      responseAggregationType: z
        .enum(["auto", "byProperty", "byPage"])
        .describe("How the results were aggregated"),
      rows: z
        .array(SearchAnalyticsRowSchema)
        .describe("Search analytics data rows"),
    }),
    execute: async ({ context }) => {
      const client = new SearchConsoleClient({
        accessToken: getAccessToken(env),
      });

      const request = {
        startDate: context.startDate,
        endDate: context.endDate,
        dimensions: context.dimensions,
        dimensionFilterGroups: context.dimensionFilterGroups,
        rowLimit: context.rowLimit ?? DEFAULT_ROW_LIMIT,
        startRow: context.startRow ?? DEFAULT_START_ROW,
        searchType: context.searchType,
        aggregationType: context.aggregationType,
      };

      const response = await client.querySearchAnalytics(
        context.siteUrl,
        request,
      );

      return {
        responseAggregationType: response.responseAggregationType,
        rows: (response.rows || []).map((row) => ({
          keys: row.keys,
          clicks: row.clicks,
          impressions: row.impressions,
          ctr: row.ctr,
          position: row.position,
        })),
      };
    },
  });

// ============================================================================
// Export all search analytics tools
// ============================================================================

export const searchAnalyticsTools = [createQuerySearchAnalyticsTool];
