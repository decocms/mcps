/**
 * Central export point for all TikTok Ads tools
 *
 * This file aggregates all tools from different modules into a single
 * export, making it easy to import all tools in main.ts.
 *
 * Tools:
 * - campaignTools: Campaign management (list, get, create, update)
 * - adgroupTools: Ad Group management (list, get, create, update)
 * - adTools: Ad management (list, get, create, update)
 * - reportTools: Reports and analytics (get_report, campaign/adgroup/ad reports, advertiser info)
 */

import { campaignTools } from "./campaigns.ts";
import { adgroupTools } from "./adgroups.ts";
import { adTools } from "./ads.ts";
import { reportTools } from "./reports.ts";

// Export all tools from all modules
export const tools = [
  // Campaign management tools
  ...campaignTools,
  // Ad Group management tools
  ...adgroupTools,
  // Ad management tools
  ...adTools,
  // Report and analytics tools
  ...reportTools,
];
