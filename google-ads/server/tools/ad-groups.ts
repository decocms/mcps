/**
 * Ad Group Management Tools
 *
 * Tools for listing, creating, updating, and managing Google Ads ad groups
 */

import { createPrivateTool } from "@decocms/runtime/tools";
import { z } from "zod";
import type { Env } from "../main.ts";
import { GoogleAdsClient, getAccessToken } from "../lib/google-ads-client.ts";
import type { AdGroupStatus, AdGroupType } from "../lib/types.ts";

// ============================================================================
// List Ad Groups Tool
// ============================================================================

export const createListAdGroupsTool = (env: Env) =>
  createPrivateTool({
    id: "list_ad_groups",
    description:
      "List ad groups for a Google Ads customer account. Can optionally filter by campaign.",
    inputSchema: z.object({
      customerId: z
        .string()
        .describe("Google Ads customer ID (e.g., '1234567890')"),
      campaignId: z
        .string()
        .optional()
        .describe("Optional campaign ID to filter ad groups"),
    }),
    outputSchema: z.object({
      adGroups: z.array(
        z.object({
          resourceName: z.string(),
          id: z.string(),
          name: z.string(),
          campaign: z.string(),
          status: z.string(),
          type: z.string().optional(),
          cpcBidMicros: z.string().optional(),
        }),
      ),
      count: z.number(),
    }),
    execute: async ({ context }) => {
      const client = new GoogleAdsClient({
        accessToken: getAccessToken(env),
      });

      const adGroups = await client.listAdGroups(
        context.customerId,
        context.campaignId,
      );

      return {
        adGroups: adGroups.map((adGroup) => ({
          resourceName: adGroup.resourceName,
          id: adGroup.id,
          name: adGroup.name,
          campaign: adGroup.campaign,
          status: adGroup.status,
          type: adGroup.type,
          cpcBidMicros: adGroup.cpcBidMicros,
        })),
        count: adGroups.length,
      };
    },
  });

// ============================================================================
// Get Ad Group Tool
// ============================================================================

export const createGetAdGroupTool = (env: Env) =>
  createPrivateTool({
    id: "get_ad_group",
    description:
      "Get detailed information about a specific Google Ads ad group.",
    inputSchema: z.object({
      customerId: z
        .string()
        .describe("Google Ads customer ID (e.g., '1234567890')"),
      adGroupId: z.string().describe("Ad group ID"),
    }),
    outputSchema: z.object({
      adGroup: z
        .object({
          resourceName: z.string(),
          id: z.string(),
          name: z.string(),
          campaign: z.string(),
          status: z.string(),
          type: z.string().optional(),
          cpcBidMicros: z.string().optional(),
          cpmBidMicros: z.string().optional(),
          targetCpaMicros: z.string().optional(),
        })
        .nullable(),
    }),
    execute: async ({ context }) => {
      const client = new GoogleAdsClient({
        accessToken: getAccessToken(env),
      });

      const adGroup = await client.getAdGroup(
        context.customerId,
        context.adGroupId,
      );

      if (!adGroup) {
        return { adGroup: null };
      }

      return {
        adGroup: {
          resourceName: adGroup.resourceName,
          id: adGroup.id,
          name: adGroup.name,
          campaign: adGroup.campaign,
          status: adGroup.status,
          type: adGroup.type,
          cpcBidMicros: adGroup.cpcBidMicros,
          cpmBidMicros: adGroup.cpmBidMicros,
          targetCpaMicros: adGroup.targetCpaMicros,
        },
      };
    },
  });

// ============================================================================
// Create Ad Group Tool
// ============================================================================

export const createCreateAdGroupTool = (env: Env) =>
  createPrivateTool({
    id: "create_ad_group",
    description:
      "Create a new ad group in a Google Ads campaign. Ad groups contain ads and keywords.",
    inputSchema: z.object({
      customerId: z
        .string()
        .describe("Google Ads customer ID (e.g., '1234567890')"),
      campaignResourceName: z
        .string()
        .describe(
          "Campaign resource name (e.g., 'customers/123/campaigns/456')",
        ),
      name: z.string().describe("Ad group name"),
      status: z
        .enum(["ENABLED", "PAUSED"])
        .optional()
        .default("PAUSED")
        .describe("Initial ad group status (default: PAUSED)"),
      type: z
        .enum([
          "SEARCH_STANDARD",
          "DISPLAY_STANDARD",
          "SHOPPING_PRODUCT_ADS",
          "VIDEO_TRUE_VIEW_IN_STREAM",
          "VIDEO_BUMPER",
          "VIDEO_RESPONSIVE",
        ])
        .optional()
        .describe("Ad group type (inferred from campaign if not specified)"),
      cpcBidMicros: z
        .string()
        .optional()
        .describe(
          "Default CPC bid in micros (1 dollar = 1,000,000 micros). E.g., '1000000' for $1",
        ),
      cpmBidMicros: z
        .string()
        .optional()
        .describe("Default CPM bid in micros (for display/video campaigns)"),
      targetCpaMicros: z
        .string()
        .optional()
        .describe("Target CPA in micros (for Target CPA bidding)"),
    }),
    outputSchema: z.object({
      resourceName: z.string().describe("Created ad group resource name"),
      success: z.boolean(),
    }),
    execute: async ({ context }) => {
      const client = new GoogleAdsClient({
        accessToken: getAccessToken(env),
      });

      const response = await client.createAdGroup(context.customerId, {
        name: context.name,
        campaign: context.campaignResourceName,
        status: (context.status || "PAUSED") as AdGroupStatus,
        type: context.type as AdGroupType | undefined,
        cpcBidMicros: context.cpcBidMicros,
        cpmBidMicros: context.cpmBidMicros,
        targetCpaMicros: context.targetCpaMicros,
      });

      const resourceName = response.results[0]?.resourceName;
      if (!resourceName) {
        throw new Error("Failed to create ad group");
      }

      return {
        resourceName,
        success: true,
      };
    },
  });

// ============================================================================
// Update Ad Group Tool
// ============================================================================

export const createUpdateAdGroupTool = (env: Env) =>
  createPrivateTool({
    id: "update_ad_group",
    description:
      "Update an existing Google Ads ad group. Can change name, status, and bidding settings.",
    inputSchema: z.object({
      customerId: z
        .string()
        .describe("Google Ads customer ID (e.g., '1234567890')"),
      adGroupResourceName: z
        .string()
        .describe(
          "Ad group resource name (e.g., 'customers/123/adGroups/456')",
        ),
      name: z.string().optional().describe("New ad group name"),
      status: z
        .enum(["ENABLED", "PAUSED", "REMOVED"])
        .optional()
        .describe("New ad group status"),
      cpcBidMicros: z
        .string()
        .optional()
        .describe("New default CPC bid in micros"),
      cpmBidMicros: z
        .string()
        .optional()
        .describe("New default CPM bid in micros"),
      targetCpaMicros: z
        .string()
        .optional()
        .describe("New target CPA in micros"),
    }),
    outputSchema: z.object({
      resourceName: z.string(),
      success: z.boolean(),
    }),
    execute: async ({ context }) => {
      const client = new GoogleAdsClient({
        accessToken: getAccessToken(env),
      });

      const response = await client.updateAdGroup(context.customerId, {
        resourceName: context.adGroupResourceName,
        name: context.name,
        status: context.status as AdGroupStatus | undefined,
        cpcBidMicros: context.cpcBidMicros,
        cpmBidMicros: context.cpmBidMicros,
        targetCpaMicros: context.targetCpaMicros,
      });

      return {
        resourceName:
          response.results[0]?.resourceName || context.adGroupResourceName,
        success: true,
      };
    },
  });

// ============================================================================
// Pause Ad Group Tool
// ============================================================================

export const createPauseAdGroupTool = (env: Env) =>
  createPrivateTool({
    id: "pause_ad_group",
    description:
      "Pause a Google Ads ad group. Sets the ad group status to PAUSED.",
    inputSchema: z.object({
      customerId: z
        .string()
        .describe("Google Ads customer ID (e.g., '1234567890')"),
      adGroupResourceName: z
        .string()
        .describe(
          "Ad group resource name (e.g., 'customers/123/adGroups/456')",
        ),
    }),
    outputSchema: z.object({
      resourceName: z.string(),
      success: z.boolean(),
    }),
    execute: async ({ context }) => {
      const client = new GoogleAdsClient({
        accessToken: getAccessToken(env),
      });

      await client.updateAdGroupStatus(
        context.customerId,
        context.adGroupResourceName,
        "PAUSED",
      );

      return {
        resourceName: context.adGroupResourceName,
        success: true,
      };
    },
  });

// ============================================================================
// Enable Ad Group Tool
// ============================================================================

export const createEnableAdGroupTool = (env: Env) =>
  createPrivateTool({
    id: "enable_ad_group",
    description:
      "Enable a Google Ads ad group. Sets the ad group status to ENABLED.",
    inputSchema: z.object({
      customerId: z
        .string()
        .describe("Google Ads customer ID (e.g., '1234567890')"),
      adGroupResourceName: z
        .string()
        .describe(
          "Ad group resource name (e.g., 'customers/123/adGroups/456')",
        ),
    }),
    outputSchema: z.object({
      resourceName: z.string(),
      success: z.boolean(),
    }),
    execute: async ({ context }) => {
      const client = new GoogleAdsClient({
        accessToken: getAccessToken(env),
      });

      await client.updateAdGroupStatus(
        context.customerId,
        context.adGroupResourceName,
        "ENABLED",
      );

      return {
        resourceName: context.adGroupResourceName,
        success: true,
      };
    },
  });

// ============================================================================
// Export all ad group tools
// ============================================================================

export const adGroupTools = [
  createListAdGroupsTool,
  createGetAdGroupTool,
  createCreateAdGroupTool,
  createUpdateAdGroupTool,
  createPauseAdGroupTool,
  createEnableAdGroupTool,
];
