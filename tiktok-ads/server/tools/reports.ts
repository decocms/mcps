/**
 * Report Tools
 *
 * Tools for getting performance reports at different levels
 */

import { createPrivateTool } from "@decocms/runtime/tools";
import { z } from "zod";
import type { Env } from "../main.ts";
import {
  TikTokClient,
  getAccessToken,
  getDefaultAdvertiserId,
} from "../lib/tiktok-client.ts";

// ============================================================================
// Schema Definitions
// ============================================================================

const DataLevelSchema = z.enum([
  "AUCTION_ADVERTISER",
  "AUCTION_CAMPAIGN",
  "AUCTION_ADGROUP",
  "AUCTION_AD",
]);

const DimensionSchema = z.enum([
  "advertiser_id",
  "campaign_id",
  "adgroup_id",
  "ad_id",
  "stat_time_day",
  "stat_time_hour",
]);

const MetricSchema = z.enum([
  "spend",
  "impressions",
  "clicks",
  "ctr",
  "cpc",
  "cpm",
  "reach",
  "frequency",
  "conversion",
  "cost_per_conversion",
  "conversion_rate",
  "video_play_actions",
  "video_watched_2s",
  "video_watched_6s",
  "average_video_play",
  "average_video_play_per_user",
  "profile_visits",
  "likes",
  "comments",
  "shares",
  "follows",
]);

const ReportRowSchema = z.object({
  dimensions: z
    .record(z.string(), z.string())
    .describe("Dimension values (campaign_id, stat_time_day, etc.)"),
  metrics: z
    .record(z.string(), z.number())
    .describe("Metric values (spend, impressions, clicks, etc.)"),
});

const PageInfoSchema = z.object({
  page: z.number().describe("Current page number"),
  page_size: z.number().describe("Items per page"),
  total_number: z.number().describe("Total number of items"),
  total_page: z.number().describe("Total number of pages"),
});

// ============================================================================
// Get Report Tool (Generic)
// ============================================================================

export const createGetReportTool = (env: Env) =>
  createPrivateTool({
    id: "get_report",
    description:
      "Get performance report data for campaigns, ad groups, or ads. Supports custom date ranges, dimensions, and metrics.",
    inputSchema: z.object({
      advertiser_id: z
        .string()
        .optional()
        .describe("Advertiser ID (optional if configured in MCP)"),
      data_level: DataLevelSchema.describe(
        "Data level: AUCTION_ADVERTISER, AUCTION_CAMPAIGN, AUCTION_ADGROUP, AUCTION_AD",
      ),
      start_date: z
        .string()
        .describe("Start date (format: YYYY-MM-DD, required)"),
      end_date: z.string().describe("End date (format: YYYY-MM-DD, required)"),
      dimensions: z
        .array(DimensionSchema)
        .optional()
        .describe(
          "Dimensions to include: advertiser_id, campaign_id, adgroup_id, ad_id, stat_time_day, stat_time_hour",
        ),
      metrics: z
        .array(MetricSchema)
        .optional()
        .describe(
          "Metrics to include: spend, impressions, clicks, ctr, cpc, cpm, reach, conversion, etc. Default: all common metrics",
        ),
      campaign_ids: z
        .array(z.string())
        .optional()
        .describe("Filter by campaign IDs"),
      adgroup_ids: z
        .array(z.string())
        .optional()
        .describe("Filter by ad group IDs"),
      ad_ids: z.array(z.string()).optional().describe("Filter by ad IDs"),
      page: z.coerce
        .number()
        .int()
        .min(1)
        .optional()
        .describe("Page number (default: 1)"),
      page_size: z.coerce
        .number()
        .int()
        .min(1)
        .max(1000)
        .optional()
        .describe("Items per page (default: 50, max: 1000)"),
    }),
    outputSchema: z.object({
      rows: z.array(ReportRowSchema).describe("Report data rows"),
      page_info: PageInfoSchema.describe("Pagination info"),
    }),
    execute: async ({ context }) => {
      const advertiserId = context.advertiser_id || getDefaultAdvertiserId(env);
      if (!advertiserId) {
        throw new Error(
          "advertiser_id is required (provide it in the tool call or configure a default in the MCP)",
        );
      }

      const client = new TikTokClient({
        accessToken: getAccessToken(env),
      });

      // Default dimensions based on data level
      let dimensions = context.dimensions;
      if (!dimensions || dimensions.length === 0) {
        switch (context.data_level) {
          case "AUCTION_CAMPAIGN":
            dimensions = ["campaign_id", "stat_time_day"];
            break;
          case "AUCTION_ADGROUP":
            dimensions = ["adgroup_id", "stat_time_day"];
            break;
          case "AUCTION_AD":
            dimensions = ["ad_id", "stat_time_day"];
            break;
          default:
            dimensions = ["advertiser_id", "stat_time_day"];
        }
      }

      // Default metrics
      const metrics =
        context.metrics && context.metrics.length > 0
          ? context.metrics
          : [
              "spend",
              "impressions",
              "clicks",
              "ctr",
              "cpc",
              "cpm",
              "conversion",
            ];

      const result = await client.getReport({
        advertiser_id: advertiserId,
        data_level: context.data_level,
        dimensions,
        metrics,
        start_date: context.start_date,
        end_date: context.end_date,
        filters: {
          campaign_ids: context.campaign_ids,
          adgroup_ids: context.adgroup_ids,
          ad_ids: context.ad_ids,
        },
        page: context.page,
        page_size: context.page_size,
      });

      return {
        rows: result.rows,
        page_info: result.page_info,
      };
    },
  });

// ============================================================================
// Get Campaign Report Tool (Simplified)
// ============================================================================

export const createGetCampaignReportTool = (env: Env) =>
  createPrivateTool({
    id: "get_campaign_report",
    description:
      "Get performance report for campaigns. Returns spend, impressions, clicks, conversions and other metrics by day.",
    inputSchema: z.object({
      advertiser_id: z
        .string()
        .optional()
        .describe("Advertiser ID (optional if configured in MCP)"),
      start_date: z
        .string()
        .describe("Start date (format: YYYY-MM-DD, required)"),
      end_date: z.string().describe("End date (format: YYYY-MM-DD, required)"),
      campaign_ids: z
        .array(z.string())
        .optional()
        .describe("Filter by specific campaign IDs"),
      page: z.coerce
        .number()
        .int()
        .min(1)
        .optional()
        .describe("Page number (default: 1)"),
      page_size: z.coerce
        .number()
        .int()
        .min(1)
        .max(1000)
        .optional()
        .describe("Items per page (default: 50)"),
    }),
    outputSchema: z.object({
      rows: z.array(ReportRowSchema).describe("Campaign report data"),
      page_info: PageInfoSchema.describe("Pagination info"),
    }),
    execute: async ({ context }) => {
      const advertiserId = context.advertiser_id || getDefaultAdvertiserId(env);
      if (!advertiserId) {
        throw new Error(
          "advertiser_id is required (provide it in the tool call or configure a default in the MCP)",
        );
      }

      const client = new TikTokClient({
        accessToken: getAccessToken(env),
      });

      const result = await client.getReport({
        advertiser_id: advertiserId,
        data_level: "AUCTION_CAMPAIGN",
        dimensions: ["campaign_id", "stat_time_day"],
        metrics: [
          "spend",
          "impressions",
          "clicks",
          "ctr",
          "cpc",
          "cpm",
          "reach",
          "conversion",
          "cost_per_conversion",
        ],
        start_date: context.start_date,
        end_date: context.end_date,
        filters: {
          campaign_ids: context.campaign_ids,
        },
        page: context.page,
        page_size: context.page_size,
      });

      return {
        rows: result.rows,
        page_info: result.page_info,
      };
    },
  });

// ============================================================================
// Get Ad Group Report Tool (Simplified)
// ============================================================================

export const createGetAdGroupReportTool = (env: Env) =>
  createPrivateTool({
    id: "get_adgroup_report",
    description:
      "Get performance report for ad groups. Returns spend, impressions, clicks, conversions and other metrics by day.",
    inputSchema: z.object({
      advertiser_id: z
        .string()
        .optional()
        .describe("Advertiser ID (optional if configured in MCP)"),
      start_date: z
        .string()
        .describe("Start date (format: YYYY-MM-DD, required)"),
      end_date: z.string().describe("End date (format: YYYY-MM-DD, required)"),
      campaign_ids: z
        .array(z.string())
        .optional()
        .describe("Filter by campaign IDs"),
      adgroup_ids: z
        .array(z.string())
        .optional()
        .describe("Filter by specific ad group IDs"),
      page: z.coerce
        .number()
        .int()
        .min(1)
        .optional()
        .describe("Page number (default: 1)"),
      page_size: z.coerce
        .number()
        .int()
        .min(1)
        .max(1000)
        .optional()
        .describe("Items per page (default: 50)"),
    }),
    outputSchema: z.object({
      rows: z.array(ReportRowSchema).describe("Ad group report data"),
      page_info: PageInfoSchema.describe("Pagination info"),
    }),
    execute: async ({ context }) => {
      const advertiserId = context.advertiser_id || getDefaultAdvertiserId(env);
      if (!advertiserId) {
        throw new Error(
          "advertiser_id is required (provide it in the tool call or configure a default in the MCP)",
        );
      }

      const client = new TikTokClient({
        accessToken: getAccessToken(env),
      });

      const result = await client.getReport({
        advertiser_id: advertiserId,
        data_level: "AUCTION_ADGROUP",
        dimensions: ["adgroup_id", "stat_time_day"],
        metrics: [
          "spend",
          "impressions",
          "clicks",
          "ctr",
          "cpc",
          "cpm",
          "reach",
          "conversion",
          "cost_per_conversion",
        ],
        start_date: context.start_date,
        end_date: context.end_date,
        filters: {
          campaign_ids: context.campaign_ids,
          adgroup_ids: context.adgroup_ids,
        },
        page: context.page,
        page_size: context.page_size,
      });

      return {
        rows: result.rows,
        page_info: result.page_info,
      };
    },
  });

// ============================================================================
// Get Ad Report Tool (Simplified)
// ============================================================================

export const createGetAdReportTool = (env: Env) =>
  createPrivateTool({
    id: "get_ad_report",
    description:
      "Get performance report for individual ads. Returns spend, impressions, clicks, conversions and other metrics by day.",
    inputSchema: z.object({
      advertiser_id: z
        .string()
        .optional()
        .describe("Advertiser ID (optional if configured in MCP)"),
      start_date: z
        .string()
        .describe("Start date (format: YYYY-MM-DD, required)"),
      end_date: z.string().describe("End date (format: YYYY-MM-DD, required)"),
      campaign_ids: z
        .array(z.string())
        .optional()
        .describe("Filter by campaign IDs"),
      adgroup_ids: z
        .array(z.string())
        .optional()
        .describe("Filter by ad group IDs"),
      ad_ids: z
        .array(z.string())
        .optional()
        .describe("Filter by specific ad IDs"),
      page: z.coerce
        .number()
        .int()
        .min(1)
        .optional()
        .describe("Page number (default: 1)"),
      page_size: z.coerce
        .number()
        .int()
        .min(1)
        .max(1000)
        .optional()
        .describe("Items per page (default: 50)"),
    }),
    outputSchema: z.object({
      rows: z.array(ReportRowSchema).describe("Ad report data"),
      page_info: PageInfoSchema.describe("Pagination info"),
    }),
    execute: async ({ context }) => {
      const advertiserId = context.advertiser_id || getDefaultAdvertiserId(env);
      if (!advertiserId) {
        throw new Error(
          "advertiser_id is required (provide it in the tool call or configure a default in the MCP)",
        );
      }

      const client = new TikTokClient({
        accessToken: getAccessToken(env),
      });

      const result = await client.getReport({
        advertiser_id: advertiserId,
        data_level: "AUCTION_AD",
        dimensions: ["ad_id", "stat_time_day"],
        metrics: [
          "spend",
          "impressions",
          "clicks",
          "ctr",
          "cpc",
          "cpm",
          "reach",
          "conversion",
          "cost_per_conversion",
          "video_play_actions",
          "video_watched_2s",
          "video_watched_6s",
          "likes",
          "comments",
          "shares",
        ],
        start_date: context.start_date,
        end_date: context.end_date,
        filters: {
          campaign_ids: context.campaign_ids,
          adgroup_ids: context.adgroup_ids,
          ad_ids: context.ad_ids,
        },
        page: context.page,
        page_size: context.page_size,
      });

      return {
        rows: result.rows,
        page_info: result.page_info,
      };
    },
  });

// ============================================================================
// Get Advertiser Info Tool
// ============================================================================

export const createGetAdvertiserInfoTool = (env: Env) =>
  createPrivateTool({
    id: "get_advertiser_info",
    description:
      "Get information about one or more advertisers, including name, status, balance, and timezone.",
    inputSchema: z.object({
      advertiser_ids: z
        .array(z.string())
        .optional()
        .describe(
          "List of advertiser IDs to retrieve (optional if configured in MCP)",
        ),
    }),
    outputSchema: z.object({
      advertisers: z
        .array(
          z.object({
            advertiser_id: z.string().describe("Advertiser ID"),
            advertiser_name: z.string().describe("Advertiser name"),
            status: z.string().describe("Account status"),
            company: z.string().optional().describe("Company name"),
            balance: z.number().optional().describe("Account balance"),
            currency: z.string().optional().describe("Currency code"),
            timezone: z.string().optional().describe("Timezone"),
            create_time: z.string().describe("Account creation time"),
          }),
        )
        .describe("List of advertiser information"),
    }),
    execute: async ({ context }) => {
      let advertiserIds = context.advertiser_ids;
      if (!advertiserIds || advertiserIds.length === 0) {
        const defaultId = getDefaultAdvertiserId(env);
        if (defaultId) {
          advertiserIds = [defaultId];
        }
      }

      if (!advertiserIds || advertiserIds.length === 0) {
        throw new Error(
          "advertiser_ids is required (provide it in the tool call or configure a default in the MCP)",
        );
      }

      const client = new TikTokClient({
        accessToken: getAccessToken(env),
      });

      const advertisers = await client.getAdvertiserInfo({
        advertiser_ids: advertiserIds,
      });

      return {
        advertisers,
      };
    },
  });

// ============================================================================
// Export all report tools
// ============================================================================

export const reportTools = [
  createGetReportTool,
  createGetCampaignReportTool,
  createGetAdGroupReportTool,
  createGetAdReportTool,
  createGetAdvertiserInfoTool,
];
