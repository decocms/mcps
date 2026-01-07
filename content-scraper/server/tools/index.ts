/**
 * Central export point for all tools.
 */
import { userTools } from "@decocms/mcps-shared/tools/user";
import { scraperTools } from "./scraper.ts";

// Export all tools
export const tools = [...userTools, ...scraperTools];

// Re-export domain-specific tools for direct access if needed
export { userTools } from "@decocms/mcps-shared/tools/user";
export { scraperTools } from "./scraper.ts";
