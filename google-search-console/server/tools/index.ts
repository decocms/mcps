/**
 * Central export point for all Google Search Console tools
 *
 * This file aggregates all tools from different modules into a single
 * export, making it easy to import all tools in main.ts.
 *
 * Tools:
 * - siteTools: Site management (list, get, add, remove)
 * - searchAnalyticsTools: Search analytics (query)
 * - sitemapTools: Sitemap management (list, get, submit, delete)
 * - urlInspectionTools: URL inspection (inspect)
 */

import { siteTools } from "./sites.ts";
import { searchAnalyticsTools } from "./search-analytics.ts";
import { sitemapTools } from "./sitemaps.ts";
import { urlInspectionTools } from "./url-inspection.ts";

// Export all tools from all modules
export const tools = [
  // Site management tools
  ...siteTools,
  // Search analytics tools
  ...searchAnalyticsTools,
  // Sitemap management tools
  ...sitemapTools,
  // URL inspection tools
  ...urlInspectionTools,
];
