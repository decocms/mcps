/**
 * Central export point for all tools organized by domain.
 *
 * This file aggregates all tools from different domains into a single
 * export, making it easy to import all tools in main.ts while keeping
 * the domain separation.
 */
import { keywordTools } from "./keywords.ts";
import { serpTools } from "./serp.ts";
import { backlinkTools } from "./backlinks.ts";
import { googleTrendsTools } from "./google-trends.ts";
import { domainAnalysisTools } from "./domain-analysis.ts";
import { keywordSuggestionsTools } from "./keyword-suggestions.ts";

// Aggregate all DataForSEO tool factories
const dataForSeoTools = [
  ...keywordTools,
  ...serpTools,
  ...backlinkTools,
  ...googleTrendsTools,
  ...domainAnalysisTools,
  ...keywordSuggestionsTools,
];

// Export all tools from all domains
export const tools = [...dataForSeoTools];

// Re-export domain-specific tools for direct access if needed
export { keywordTools } from "./keywords.ts";
export { serpTools } from "./serp.ts";
export { backlinkTools } from "./backlinks.ts";
export { googleTrendsTools } from "./google-trends.ts";
export { domainAnalysisTools } from "./domain-analysis.ts";
export { keywordSuggestionsTools } from "./keyword-suggestions.ts";
