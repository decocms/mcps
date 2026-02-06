/**
 * Central export point for all tools organized by domain.
 *
 * This file aggregates all tools from different domains into a single
 * export, making it easy to import all tools in main.ts while keeping
 * the domain separation.
 */
import type { Env } from "../types/env.ts";
import { keywordTools } from "./keywords.ts";
import { serpTools } from "./serp.ts";
import { backlinkTools } from "./backlinks.ts";
import { googleTrendsTools } from "./google-trends.ts";
import { domainAnalysisTools } from "./domain-analysis.ts";
import { keywordSuggestionsTools } from "./keyword-suggestions.ts";

type ToolFactory = (env: Env) => unknown;

/**
 * Wrap tool factory with logging
 */
function wrapWithLogging(toolFactory: ToolFactory, index: number): ToolFactory {
  return (env: Env) => {
    console.log(`[DataForSEO Tools] Creating tool #${index + 1}`);
    console.log(
      `[DataForSEO Tools] Env has MESH_REQUEST_CONTEXT:`,
      !!env.MESH_REQUEST_CONTEXT,
    );
    const tool = toolFactory(env);
    console.log(`[DataForSEO Tools] Tool #${index + 1} created successfully`);
    return tool;
  };
}

// Aggregate all DataForSEO tool factories
// Note: Some tools require specific subscriptions or are not available in all plans
const dataForSeoTools = [
  ...keywordTools,
  ...serpTools,
  // Backlinks tools require Backlinks API subscription
  // ...backlinkTools,
  // Google Trends has parameter issues with the current API
  // ...googleTrendsTools,
  // Domain Analysis tools (only include working ones)
  ...domainAnalysisTools.slice(0, 2), // Ranked Keywords and Domain Rank only
  // Keyword Suggestions tools return 404 (not available in API)
  // ...keywordSuggestionsTools,
];

console.log("[DataForSEO Tools] Total tool factories:", dataForSeoTools.length);

// Wrap all tools with logging
const wrappedTools = dataForSeoTools.map((factory, index) =>
  wrapWithLogging(factory, index),
);

// Export all tools from all domains
export const tools = wrappedTools;

// Re-export domain-specific tools for direct access if needed
export { keywordTools } from "./keywords.ts";
export { serpTools } from "./serp.ts";
export { backlinkTools } from "./backlinks.ts";
export { googleTrendsTools } from "./google-trends.ts";
export { domainAnalysisTools } from "./domain-analysis.ts";
export { keywordSuggestionsTools } from "./keyword-suggestions.ts";
