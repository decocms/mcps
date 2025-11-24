/**
 * Central export point for all tools organized by domain.
 *
 * This file aggregates all tools from different domains into a single
 * export, making it easy to import all tools in main.ts while keeping
 * the domain separation.
 */
import { userTools } from "@decocms/mcps-shared/tools/user";
import { keywordTools } from "./keywords";
import { serpTools } from "./serp";
import { backlinkTools } from "./backlinks";
import { trafficTools } from "./traffic";

// Aggregate all DataForSEO tool factories
const dataForSeoTools = [
  ...keywordTools,
  ...serpTools,
  ...backlinkTools,
  ...trafficTools,
];

// Export all tools from all domains
export const tools = [...userTools, ...dataForSeoTools];

// Re-export domain-specific tools for direct access if needed
export { userTools } from "@decocms/mcps-shared/tools/user";
export { keywordTools } from "./keywords";
export { serpTools } from "./serp";
export { backlinkTools } from "./backlinks";
export { trafficTools } from "./traffic";
