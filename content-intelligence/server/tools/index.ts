/**
 * Content Intelligence MCP Tools
 *
 * Central export point for all MCP tools organized by functionality.
 *
 * Available tools:
 * - SEARCH_CONTENT: Search and filter aggregated content
 * - GET_WEEKLY_DIGEST: Retrieve weekly content digest
 * - GET_TRENDS: Analyze content for trends and patterns
 *
 * Standard tools:
 * - GET_USER: Get current authenticated user (from shared)
 *
 * @module tools
 * @version 1.0.0
 */

import { userTools } from "@decocms/mcps-shared/tools/user";
import { createSearchContentTool } from "./search-content.ts";
import { createGetWeeklyDigestTool } from "./get-weekly-digest.ts";
import { createGetTrendsTool } from "./get-trends.ts";

/**
 * Export all tools for the Content Intelligence MCP.
 *
 * Tools are organized by domain:
 * - Content discovery: search_content
 * - Aggregation: get_weekly_digest
 * - Analysis: get_trends
 */
export const tools = [
  // Standard user tools
  ...userTools,

  // Content Intelligence domain tools
  createSearchContentTool,
  createGetWeeklyDigestTool,
  createGetTrendsTool,
];

// Re-export individual tools for direct access if needed
export { createSearchContentTool } from "./search-content.ts";
export { createGetWeeklyDigestTool } from "./get-weekly-digest.ts";
export { createGetTrendsTool } from "./get-trends.ts";
