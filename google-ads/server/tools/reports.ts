/**
 * Reporting Tools
 *
 * Tools for getting Google Ads performance reports and metrics
 */

import { createPrivateTool } from "@decocms/runtime/tools";
import { z } from "zod";
import type { Env } from "../main.ts";
import { GoogleAdsClient, getAccessToken } from "../lib/google-ads-client.ts";
import { DATE_RANGE_PRESETS } from "../constants.ts";

// Helper to convert micros to currency string
const microsToAmount = (micros: string | undefined): string | undefined => {
  if (!micros) return undefined;
  const amount = parseInt(micros, 10) / 1_000_000;
  return amount.toFixed(2);
};

// ============================================================================
// Get Account Performance Tool
// ============================================================================

export const createGetAccountPerformanceTool = (env: Env) =>
  createPrivateTool({
    id: "get_account_performance",
    description:
      "Get overall account performance metrics for a Google Ads customer account over a specified date range.",
    inputSchema: z.object({
      customerId: z
        .string()
        .describe("Google Ads customer ID (e.g., '1234567890')"),
      dateRange: z
        .enum([
          "TODAY",
          "YESTERDAY",
          "LAST_7_DAYS",
          "LAST_14_DAYS",
          "LAST_30_DAYS",
          "LAST_90_DAYS",
          "THIS_WEEK_SUN_TODAY",
          "THIS_WEEK_MON_TODAY",
          "LAST_WEEK_SUN_SAT",
          "LAST_WEEK_MON_SUN",
          "THIS_MONTH",
          "LAST_MONTH",
          "ALL_TIME",
        ])
        .default("LAST_30_DAYS")
        .describe("Date range for the report (default: LAST_30_DAYS)"),
    }),
    outputSchema: z.object({
      accountId: z.string(),
      accountName: z.string().optional(),
      dateRange: z.string(),
      metrics: z.object({
        impressions: z.string().optional(),
        clicks: z.string().optional(),
        cost: z.string().optional().describe("Cost in account currency"),
        conversions: z.number().optional(),
        conversionsValue: z.number().optional(),
        ctr: z.number().optional().describe("Click-through rate (percentage)"),
        averageCpc: z.string().optional().describe("Average cost per click"),
        averageCpm: z
          .string()
          .optional()
          .describe("Average cost per 1000 impressions"),
      }),
    }),
    execute: async ({ context }) => {
        const developerToken = env.MESH_REQUEST_CONTEXT?.state?.developerToken || 
                              process.env.GOOGLE_ADS_DEVELOPER_TOKEN ||
                              "NSC8PQesrKHxJCsygni2A";
        
        const client = new GoogleAdsClient({
          accessToken: getAccessToken(env),
          developerToken,
        });

      const rows = await client.getAccountPerformance(
        context.customerId,
        context.dateRange,
      );

      const row = rows[0];
      if (!row) {
        return {
          accountId: context.customerId,
          dateRange: context.dateRange,
          metrics: {},
        };
      }

      return {
        accountId: row.customer?.id || context.customerId,
        accountName: row.customer?.descriptiveName,
        dateRange: context.dateRange,
        metrics: {
          impressions: row.metrics?.impressions,
          clicks: row.metrics?.clicks,
          cost: microsToAmount(row.metrics?.costMicros),
          conversions: row.metrics?.conversions,
          conversionsValue: row.metrics?.conversionsValue,
          ctr: row.metrics?.ctr,
          averageCpc: microsToAmount(row.metrics?.averageCpc?.toString()),
          averageCpm: microsToAmount(row.metrics?.averageCpm?.toString()),
        },
      };
    },
  });

// ============================================================================
// Get Campaign Performance Tool
// ============================================================================

export const createGetCampaignPerformanceTool = (env: Env) =>
  createPrivateTool({
    id: "get_campaign_performance",
    description:
      "Get campaign performance metrics for all campaigns or a specific campaign over a date range. Shows daily breakdown.",
    inputSchema: z.object({
      customerId: z
        .string()
        .describe("Google Ads customer ID (e.g., '1234567890')"),
      campaignId: z
        .string()
        .optional()
        .describe("Optional campaign ID to filter results"),
      dateRange: z
        .enum([
          "TODAY",
          "YESTERDAY",
          "LAST_7_DAYS",
          "LAST_14_DAYS",
          "LAST_30_DAYS",
          "LAST_90_DAYS",
          "THIS_WEEK_SUN_TODAY",
          "THIS_WEEK_MON_TODAY",
          "LAST_WEEK_SUN_SAT",
          "LAST_WEEK_MON_SUN",
          "THIS_MONTH",
          "LAST_MONTH",
          "ALL_TIME",
        ])
        .default("LAST_30_DAYS")
        .describe("Date range for the report (default: LAST_30_DAYS)"),
    }),
    outputSchema: z.object({
      dateRange: z.string(),
      data: z.array(
        z.object({
          date: z.string().optional(),
          campaignId: z.string(),
          campaignName: z.string(),
          status: z.string(),
          impressions: z.string().optional(),
          clicks: z.string().optional(),
          cost: z.string().optional(),
          conversions: z.number().optional(),
          conversionsValue: z.number().optional(),
          ctr: z.number().optional(),
          averageCpc: z.string().optional(),
        }),
      ),
      count: z.number(),
    }),
    execute: async ({ context }) => {
        const developerToken = env.MESH_REQUEST_CONTEXT?.state?.developerToken || 
                              process.env.GOOGLE_ADS_DEVELOPER_TOKEN ||
                              "NSC8PQesrKHxJCsygni2A";
        
        const client = new GoogleAdsClient({
          accessToken: getAccessToken(env),
          developerToken,
        });

      const rows = await client.getCampaignPerformance(
        context.customerId,
        context.dateRange,
        context.campaignId,
      );

      return {
        dateRange: context.dateRange,
        data: rows.map((row) => ({
          date: row.segments?.date,
          campaignId: row.campaign?.id || "",
          campaignName: row.campaign?.name || "",
          status: row.campaign?.status || "",
          impressions: row.metrics?.impressions,
          clicks: row.metrics?.clicks,
          cost: microsToAmount(row.metrics?.costMicros),
          conversions: row.metrics?.conversions,
          conversionsValue: row.metrics?.conversionsValue,
          ctr: row.metrics?.ctr,
          averageCpc: microsToAmount(row.metrics?.averageCpc?.toString()),
        })),
        count: rows.length,
      };
    },
  });

// ============================================================================
// Get Ad Group Performance Tool
// ============================================================================

export const createGetAdGroupPerformanceTool = (env: Env) =>
  createPrivateTool({
    id: "get_ad_group_performance",
    description:
      "Get ad group performance metrics over a date range. Can filter by campaign.",
    inputSchema: z.object({
      customerId: z
        .string()
        .describe("Google Ads customer ID (e.g., '1234567890')"),
      campaignId: z
        .string()
        .optional()
        .describe("Optional campaign ID to filter results"),
      dateRange: z
        .enum([
          "TODAY",
          "YESTERDAY",
          "LAST_7_DAYS",
          "LAST_14_DAYS",
          "LAST_30_DAYS",
          "LAST_90_DAYS",
          "THIS_WEEK_SUN_TODAY",
          "THIS_WEEK_MON_TODAY",
          "LAST_WEEK_SUN_SAT",
          "LAST_WEEK_MON_SUN",
          "THIS_MONTH",
          "LAST_MONTH",
          "ALL_TIME",
        ])
        .default("LAST_30_DAYS")
        .describe("Date range for the report (default: LAST_30_DAYS)"),
    }),
    outputSchema: z.object({
      dateRange: z.string(),
      data: z.array(
        z.object({
          date: z.string().optional(),
          adGroupId: z.string(),
          adGroupName: z.string(),
          campaign: z.string().optional(),
          status: z.string(),
          impressions: z.string().optional(),
          clicks: z.string().optional(),
          cost: z.string().optional(),
          conversions: z.number().optional(),
          ctr: z.number().optional(),
          averageCpc: z.string().optional(),
        }),
      ),
      count: z.number(),
    }),
    execute: async ({ context }) => {
        const developerToken = env.MESH_REQUEST_CONTEXT?.state?.developerToken || 
                              process.env.GOOGLE_ADS_DEVELOPER_TOKEN ||
                              "NSC8PQesrKHxJCsygni2A";
        
        const client = new GoogleAdsClient({
          accessToken: getAccessToken(env),
          developerToken,
        });

      const rows = await client.getAdGroupPerformance(
        context.customerId,
        context.dateRange,
        context.campaignId,
      );

      return {
        dateRange: context.dateRange,
        data: rows.map((row) => ({
          date: row.segments?.date,
          adGroupId: row.adGroup?.id || "",
          adGroupName: row.adGroup?.name || "",
          campaign: row.adGroup?.campaign,
          status: row.adGroup?.status || "",
          impressions: row.metrics?.impressions,
          clicks: row.metrics?.clicks,
          cost: microsToAmount(row.metrics?.costMicros),
          conversions: row.metrics?.conversions,
          ctr: row.metrics?.ctr,
          averageCpc: microsToAmount(row.metrics?.averageCpc?.toString()),
        })),
        count: rows.length,
      };
    },
  });

// ============================================================================
// Get Keyword Performance Tool
// ============================================================================

export const createGetKeywordPerformanceTool = (env: Env) =>
  createPrivateTool({
    id: "get_keyword_performance",
    description:
      "Get keyword performance metrics over a date range. Shows which keywords are performing best.",
    inputSchema: z.object({
      customerId: z
        .string()
        .describe("Google Ads customer ID (e.g., '1234567890')"),
      adGroupId: z
        .string()
        .optional()
        .describe("Optional ad group ID to filter results"),
      dateRange: z
        .enum([
          "TODAY",
          "YESTERDAY",
          "LAST_7_DAYS",
          "LAST_14_DAYS",
          "LAST_30_DAYS",
          "LAST_90_DAYS",
          "THIS_WEEK_SUN_TODAY",
          "THIS_WEEK_MON_TODAY",
          "LAST_WEEK_SUN_SAT",
          "LAST_WEEK_MON_SUN",
          "THIS_MONTH",
          "LAST_MONTH",
          "ALL_TIME",
        ])
        .default("LAST_30_DAYS")
        .describe("Date range for the report (default: LAST_30_DAYS)"),
    }),
    outputSchema: z.object({
      dateRange: z.string(),
      data: z.array(
        z.object({
          date: z.string().optional(),
          criterionId: z.string(),
          keywordText: z.string(),
          matchType: z.string(),
          adGroupName: z.string().optional(),
          status: z.string(),
          impressions: z.string().optional(),
          clicks: z.string().optional(),
          cost: z.string().optional(),
          conversions: z.number().optional(),
          ctr: z.number().optional(),
          averageCpc: z.string().optional(),
          qualityScore: z.number().optional(),
        }),
      ),
      count: z.number(),
    }),
    execute: async ({ context }) => {
        const developerToken = env.MESH_REQUEST_CONTEXT?.state?.developerToken || 
                              process.env.GOOGLE_ADS_DEVELOPER_TOKEN ||
                              "NSC8PQesrKHxJCsygni2A";
        
        const client = new GoogleAdsClient({
          accessToken: getAccessToken(env),
          developerToken,
        });

      const rows = await client.getKeywordPerformance(
        context.customerId,
        context.dateRange,
        context.adGroupId,
      );

      return {
        dateRange: context.dateRange,
        data: rows.map((row) => ({
          date: row.segments?.date,
          criterionId: row.adGroupCriterion?.criterionId || "",
          keywordText: row.adGroupCriterion?.keyword?.text || "",
          matchType: row.adGroupCriterion?.keyword?.matchType || "",
          adGroupName: row.adGroup?.name,
          status: row.adGroupCriterion?.status || "",
          impressions: row.metrics?.impressions,
          clicks: row.metrics?.clicks,
          cost: microsToAmount(row.metrics?.costMicros),
          conversions: row.metrics?.conversions,
          ctr: row.metrics?.ctr,
          averageCpc: microsToAmount(row.metrics?.averageCpc?.toString()),
          qualityScore: row.adGroupCriterion?.qualityInfo?.qualityScore,
        })),
        count: rows.length,
      };
    },
  });

// ============================================================================
// Export all report tools
// ============================================================================

export const reportTools = [
  createGetAccountPerformanceTool,
  createGetCampaignPerformanceTool,
  createGetAdGroupPerformanceTool,
  createGetKeywordPerformanceTool,
];
