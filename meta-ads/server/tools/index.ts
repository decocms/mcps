/**
 * Central export point for all Meta Ads Analytics tools.
 *
 * This file aggregates all tools from different domains into a single
 * export, making it easy to import all tools in main.ts.
 *
 * Tools included:
 * - Account tools: get_ad_accounts, get_account_info, get_account_pages
 * - Campaign tools: get_campaigns, get_campaign_details
 * - AdSet tools: get_adsets, get_adset_details
 * - Ad tools: get_ads, get_ad_details, get_ad_creatives
 * - Insights tools: get_insights
 */

import { accountTools } from "./accounts.ts";
import { campaignTools } from "./campaigns.ts";
import { adsetTools } from "./adsets.ts";
import { adTools } from "./ads.ts";
import { insightTools } from "./insights.ts";

// Export all tools combined
export const tools = [
  ...accountTools,
  ...campaignTools,
  ...adsetTools,
  ...adTools,
  ...insightTools,
];

// Re-export domain-specific tools for direct access if needed
export { accountTools } from "./accounts.ts";
export { campaignTools } from "./campaigns.ts";
export { adsetTools } from "./adsets.ts";
export { adTools } from "./ads.ts";
export { insightTools } from "./insights.ts";
