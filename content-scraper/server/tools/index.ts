/**
 * Central export point for all tools.
 */
import { contentScrapeTools } from "./content-scrape.ts";
import { scrapingTools } from "./scraping.ts";
import { contentTools } from "./content-tools.ts";
import { sourcesTools } from "./sources.ts";
import { skillsTools } from "./skills.ts";

// Export all tools
export const tools = [
  ...contentScrapeTools,
  ...scrapingTools,
  ...contentTools,
  ...sourcesTools,
  ...skillsTools,
];

// Re-export domain-specific tools for direct access if needed
export { contentScrapeTools } from "./content-scrape.ts";
export { scrapingTools } from "./scraping.ts";
export { contentTools } from "./content-tools.ts";
export { sourcesTools } from "./sources.ts";
export { skillsTools } from "./skills.ts";
