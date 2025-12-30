/**
 * Insights/Analytics tools for Meta Ads
 *
 * Tools:
 * - META_ADS_GET_INSIGHTS: Get performance metrics for any object (account, campaign, adset, ad)
 */

import { createPrivateTool } from "@decocms/runtime/tools";
import { z } from "zod";
import type { Env } from "../main.ts";
import { getMetaAccessToken } from "../main.ts";
import { createMetaAdsClient } from "../lib/meta-client.ts";
import { TIME_PRESETS, VALID_BREAKDOWNS } from "../constants.ts";

// Schema for action metrics (used in multiple places)
const actionMetricSchema = z.array(
  z.object({
    action_type: z.string(),
    value: z.string(),
  }),
);

/**
 * Get performance insights for any object
 */
export const createGetInsightsTool = (env: Env) =>
  createPrivateTool({
    id: "META_ADS_GET_INSIGHTS",
    description: `Get performance insights for a Meta Ads object (account, campaign, ad set, or ad). 
Returns metrics like impressions, reach, clicks, CTR, CPC, CPM, spend, and conversions.
Can break down results by age, gender, country, device, etc.
Use date_preset for common time ranges (last_7d, last_30d, etc) or time_range for custom dates.`,
    inputSchema: z.object({
      object_id: z
        .string()
        .describe(
          "ID of the account (act_XXX), campaign, ad set, or ad to get insights for",
        ),
      date_preset: z
        .enum(TIME_PRESETS)
        .optional()
        .describe(
          "Predefined time range: today, yesterday, last_7d, last_14d, last_28d, last_30d, last_90d, this_month, last_month, this_quarter, last_quarter, this_year, last_year, lifetime",
        ),
      time_range_since: z
        .string()
        .optional()
        .describe(
          "Start date for custom time range (format: YYYY-MM-DD). Requires time_range_until.",
        ),
      time_range_until: z
        .string()
        .optional()
        .describe(
          "End date for custom time range (format: YYYY-MM-DD). Requires time_range_since.",
        ),
      breakdowns: z
        .array(z.enum(VALID_BREAKDOWNS))
        .optional()
        .describe(
          "Break down results by: age, gender, country, region, dma, impression_device, device_platform, platform_position, publisher_platform, product_id",
        ),
      level: z
        .enum(["account", "campaign", "adset", "ad"])
        .optional()
        .describe(
          "Level of aggregation when querying an account. Default: aggregate all.",
        ),
      limit: z.coerce
        .number()
        .optional()
        .default(100)
        .describe(
          "Maximum number of insight rows to return (default: 100, useful when using breakdowns)",
        ),
    }),
    outputSchema: z.object({
      insights: z.array(
        z.object({
          // Identification
          account_id: z.string().optional(),
          campaign_id: z.string().optional(),
          campaign_name: z.string().optional(),
          adset_id: z.string().optional(),
          adset_name: z.string().optional(),
          ad_id: z.string().optional(),
          ad_name: z.string().optional(),

          // Time period
          date_start: z.string(),
          date_stop: z.string(),

          // Performance metrics
          impressions: z.string().optional(),
          reach: z.string().optional(),
          frequency: z.string().optional(),
          clicks: z.string().optional(),
          unique_clicks: z.string().optional(),
          ctr: z.string().optional(),
          unique_ctr: z.string().optional(),
          cpc: z.string().optional(),
          cpm: z.string().optional(),
          cpp: z.string().optional(),

          // Cost metrics
          spend: z.string().optional(),
          cost_per_unique_click: z.string().optional(),

          // Actions (conversions, etc)
          actions: actionMetricSchema.optional(),
          conversions: actionMetricSchema.optional(),
          cost_per_action_type: actionMetricSchema.optional(),
          cost_per_conversion: actionMetricSchema.optional(),

          // Breakdown fields
          age: z.string().optional(),
          gender: z.string().optional(),
          country: z.string().optional(),
          region: z.string().optional(),
          device_platform: z.string().optional(),
          platform_position: z.string().optional(),
          publisher_platform: z.string().optional(),
          impression_device: z.string().optional(),
        }),
      ),
      summary: z.object({
        total_rows: z.number(),
        date_range: z.object({
          start: z.string(),
          end: z.string(),
        }),
      }),
    }),
    execute: async ({ context }) => {
      const accessToken = await getMetaAccessToken(env);
      const client = createMetaAdsClient({ accessToken });

      // Build time range if custom dates provided
      let timeRange: { since: string; until: string } | undefined;
      if (context.time_range_since && context.time_range_until) {
        timeRange = {
          since: context.time_range_since,
          until: context.time_range_until,
        };
      }

      const response = await client.getInsights(context.object_id, {
        date_preset: timeRange ? undefined : context.date_preset || "last_30d",
        time_range: timeRange,
        breakdowns: context.breakdowns,
        level: context.level,
        limit: context.limit,
      });

      // Extract date range from results
      const dates = response.data.map((row) => ({
        start: row.date_start,
        end: row.date_stop,
      }));

      const dateRange = {
        start: dates.length > 0 ? dates[0].start : "",
        end: dates.length > 0 ? dates[dates.length - 1].end : "",
      };

      return {
        insights: response.data.map((row) => ({
          // Identification
          account_id: row.account_id,
          campaign_id: row.campaign_id,
          campaign_name: row.campaign_name,
          adset_id: row.adset_id,
          adset_name: row.adset_name,
          ad_id: row.ad_id,
          ad_name: row.ad_name,

          // Time
          date_start: row.date_start,
          date_stop: row.date_stop,

          // Performance
          impressions: row.impressions,
          reach: row.reach,
          frequency: row.frequency,
          clicks: row.clicks,
          unique_clicks: row.unique_clicks,
          ctr: row.ctr,
          unique_ctr: row.unique_ctr,
          cpc: row.cpc,
          cpm: row.cpm,
          cpp: row.cpp,

          // Cost
          spend: row.spend,
          cost_per_unique_click: row.cost_per_unique_click,

          // Actions
          actions: row.actions,
          conversions: row.conversions,
          cost_per_action_type: row.cost_per_action_type,
          cost_per_conversion: row.cost_per_conversion,

          // Breakdowns
          age: row.age,
          gender: row.gender,
          country: row.country,
          region: row.region,
          device_platform: row.device_platform,
          platform_position: row.platform_position,
          publisher_platform: row.publisher_platform,
          impression_device: row.impression_device,
        })),
        summary: {
          total_rows: response.data.length,
          date_range: dateRange,
        },
      };
    },
  });

// Export all insight tools
export const insightTools = [createGetInsightsTool];
