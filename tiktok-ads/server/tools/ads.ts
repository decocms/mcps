/**
 * Ad Management Tools
 *
 * Tools for listing, creating, and updating ads
 */

import { createPrivateTool } from "@decocms/runtime/tools";
import { z } from "zod";
import type { Env } from "../main.ts";
import { TikTokClient, getAccessToken } from "../lib/tiktok-client.ts";

// ============================================================================
// Schema Definitions
// ============================================================================

const OperationStatusSchema = z.enum(["ENABLE", "DISABLE", "DELETE"]);

const AdFormatSchema = z.enum([
  "SINGLE_VIDEO",
  "SINGLE_IMAGE",
  "VIDEO_CAROUSEL",
  "IMAGE_CAROUSEL",
  "SPARK_ADS",
]);

const AdSchema = z.object({
  ad_id: z.string().describe("Ad ID"),
  ad_name: z.string().describe("Ad name"),
  advertiser_id: z.string().describe("Advertiser ID"),
  campaign_id: z.string().describe("Campaign ID"),
  adgroup_id: z.string().describe("Ad Group ID"),
  operation_status: OperationStatusSchema.describe("Operation status"),
  secondary_status: z.string().describe("Secondary status"),
  ad_format: AdFormatSchema.describe("Ad format"),
  ad_text: z.string().optional().describe("Ad text/caption"),
  call_to_action: z.string().optional().describe("Call to action text"),
  landing_page_url: z.string().optional().describe("Landing page URL"),
  display_name: z.string().optional().describe("Display name"),
  video_id: z.string().optional().describe("Video ID"),
  image_ids: z.array(z.string()).optional().describe("Image IDs"),
  create_time: z.string().describe("Creation timestamp"),
  modify_time: z.string().describe("Last modification timestamp"),
});

const PageInfoSchema = z.object({
  page: z.number().describe("Current page number"),
  page_size: z.number().describe("Items per page"),
  total_number: z.number().describe("Total number of items"),
  total_page: z.number().describe("Total number of pages"),
});

// ============================================================================
// List Ads Tool
// ============================================================================

export const createListAdsTool = (env: Env) =>
  createPrivateTool({
    id: "list_ads",
    description:
      "List all ads for an advertiser with optional filters for campaign, ad group, name, and status.",
    inputSchema: z.object({
      advertiser_id: z.string().describe("Advertiser ID (required)"),
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
      ad_name: z
        .string()
        .optional()
        .describe("Filter by ad name (partial match)"),
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
      ads: z.array(AdSchema).describe("List of ads"),
      page_info: PageInfoSchema.describe("Pagination info"),
    }),
    execute: async ({ context }) => {
      const client = new TikTokClient({
        accessToken: getAccessToken(env),
      });

      const result = await client.listAds({
        advertiser_id: context.advertiser_id,
        campaign_ids: context.campaign_ids,
        adgroup_ids: context.adgroup_ids,
        ad_ids: context.ad_ids,
        filtering: {
          ad_name: context.ad_name,
        },
        page: context.page,
        page_size: context.page_size,
      });

      return {
        ads: result.ads,
        page_info: result.page_info,
      };
    },
  });

// ============================================================================
// Get Ad Tool
// ============================================================================

export const createGetAdTool = (env: Env) =>
  createPrivateTool({
    id: "get_ad",
    description: "Get detailed information about a specific ad by its ID.",
    inputSchema: z.object({
      advertiser_id: z.string().describe("Advertiser ID (required)"),
      ad_id: z.string().describe("Ad ID to retrieve"),
    }),
    outputSchema: z.object({
      ad: AdSchema.nullable().describe("Ad details"),
    }),
    execute: async ({ context }) => {
      const client = new TikTokClient({
        accessToken: getAccessToken(env),
      });

      const result = await client.listAds({
        advertiser_id: context.advertiser_id,
        ad_ids: [context.ad_id],
      });

      return {
        ad: result.ads[0] || null,
      };
    },
  });

// ============================================================================
// Create Ad Tool
// ============================================================================

export const createCreateAdTool = (env: Env) =>
  createPrivateTool({
    id: "create_ad",
    description:
      "Create a new ad within an ad group. Requires advertiser ID, ad group ID, name, and ad format.",
    inputSchema: z.object({
      advertiser_id: z.string().describe("Advertiser ID (required)"),
      adgroup_id: z.string().describe("Ad Group ID (required)"),
      ad_name: z.string().describe("Ad name (required)"),
      ad_format: AdFormatSchema.describe(
        "Ad format (required). Options: SINGLE_VIDEO, SINGLE_IMAGE, VIDEO_CAROUSEL, IMAGE_CAROUSEL, SPARK_ADS",
      ),
      ad_text: z
        .string()
        .optional()
        .describe("Ad text/caption (max 100 characters)"),
      call_to_action: z
        .string()
        .optional()
        .describe(
          "Call to action (e.g., 'Learn More', 'Shop Now', 'Sign Up', 'Download')",
        ),
      landing_page_url: z
        .string()
        .url()
        .optional()
        .describe("Landing page URL"),
      display_name: z
        .string()
        .optional()
        .describe("Display name shown on the ad"),
      video_id: z
        .string()
        .optional()
        .describe("Video ID (required for video ads)"),
      image_ids: z
        .array(z.string())
        .optional()
        .describe("Image IDs (required for image ads)"),
      identity_id: z
        .string()
        .optional()
        .describe("TikTok account identity ID (for Spark Ads)"),
      identity_type: z
        .string()
        .optional()
        .describe("Identity type: AUTH_CODE, TT_USER"),
      operation_status: OperationStatusSchema.optional().describe(
        "Initial status: ENABLE or DISABLE",
      ),
    }),
    outputSchema: z.object({
      ad_id: z.string().describe("ID of the created ad"),
      success: z.boolean().describe("Whether creation was successful"),
      message: z.string().describe("Result message"),
    }),
    execute: async ({ context }) => {
      const client = new TikTokClient({
        accessToken: getAccessToken(env),
      });

      const result = await client.createAd({
        advertiser_id: context.advertiser_id,
        adgroup_id: context.adgroup_id,
        ad_name: context.ad_name,
        ad_format: context.ad_format,
        ad_text: context.ad_text,
        call_to_action: context.call_to_action,
        landing_page_url: context.landing_page_url,
        display_name: context.display_name,
        video_id: context.video_id,
        image_ids: context.image_ids,
        identity_id: context.identity_id,
        identity_type: context.identity_type,
        operation_status: context.operation_status,
      });

      return {
        ad_id: result.ad_id,
        success: true,
        message: `Ad "${context.ad_name}" created successfully`,
      };
    },
  });

// ============================================================================
// Update Ad Tool
// ============================================================================

export const createUpdateAdTool = (env: Env) =>
  createPrivateTool({
    id: "update_ad",
    description: "Update an existing ad. Only provided fields will be updated.",
    inputSchema: z.object({
      advertiser_id: z.string().describe("Advertiser ID (required)"),
      ad_id: z.string().describe("Ad ID to update (required)"),
      ad_name: z.string().optional().describe("New ad name"),
      ad_text: z.string().optional().describe("New ad text/caption"),
      call_to_action: z.string().optional().describe("New call to action"),
      landing_page_url: z
        .string()
        .url()
        .optional()
        .describe("New landing page URL"),
      operation_status: OperationStatusSchema.optional().describe(
        "New status: ENABLE, DISABLE, or DELETE",
      ),
    }),
    outputSchema: z.object({
      ad_id: z.string().describe("ID of the updated ad"),
      success: z.boolean().describe("Whether update was successful"),
      message: z.string().describe("Result message"),
    }),
    execute: async ({ context }) => {
      const client = new TikTokClient({
        accessToken: getAccessToken(env),
      });

      const result = await client.updateAd({
        advertiser_id: context.advertiser_id,
        ad_id: context.ad_id,
        ad_name: context.ad_name,
        ad_text: context.ad_text,
        call_to_action: context.call_to_action,
        landing_page_url: context.landing_page_url,
        operation_status: context.operation_status,
      });

      return {
        ad_id: result.ad_id,
        success: true,
        message: `Ad ${context.ad_id} updated successfully`,
      };
    },
  });

// ============================================================================
// Export all ad tools
// ============================================================================

export const adTools = [
  createListAdsTool,
  createGetAdTool,
  createCreateAdTool,
  createUpdateAdTool,
];
