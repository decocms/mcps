/**
 * Central export point for all Google Ads tools
 *
 * This file aggregates all tools from different modules into a single
 * export, making it easy to import all tools in main.ts.
 *
 * Tools:
 * - accountTools: Account management (list accessible customers, get customer)
 * - campaignTools: Campaign management (list, get, create, update, pause, enable)
 * - adGroupTools: Ad group management (list, get, create, update, pause, enable)
 * - adTools: Ad management (list, get, create responsive search ad, pause, enable)
 * - keywordTools: Keyword management (list, get, create, create negative, update, pause, enable, remove)
 * - reportTools: Performance reports (account, campaign, ad group, keyword)
 */

import { accountTools } from "./accounts.ts";
import { campaignTools } from "./campaigns.ts";
import { adGroupTools } from "./ad-groups.ts";
import { adTools } from "./ads.ts";
import { keywordTools } from "./keywords.ts";
import { reportTools } from "./reports.ts";

// Export all tools from all modules
export const tools = [
  // Account management tools
  ...accountTools,
  // Campaign management tools
  ...campaignTools,
  // Ad group management tools
  ...adGroupTools,
  // Ad management tools
  ...adTools,
  // Keyword management tools
  ...keywordTools,
  // Report tools
  ...reportTools,
];
