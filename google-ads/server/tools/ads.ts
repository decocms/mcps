/**
 * Ad Management Tools
 *
 * Tools for listing, creating, updating, and managing Google Ads ads
 */

import { createPrivateTool } from "@decocms/runtime/tools";
import { z } from "zod";
import type { Env } from "../main.ts";
import { GoogleAdsClient, getAccessToken } from "../lib/google-ads-client.ts";
import type { AdGroupAdStatus } from "../lib/types.ts";

// ============================================================================
// List Ads Tool
// ============================================================================

export const createListAdsTool = (env: Env) =>
  createPrivateTool({
    id: "list_ads",
    description:
      "List ads for a Google Ads customer account. Can optionally filter by ad group.",
    inputSchema: z.object({
      customerId: z
        .string()
        .describe("Google Ads customer ID (e.g., '1234567890')"),
      adGroupId: z
        .string()
        .optional()
        .describe("Optional ad group ID to filter ads"),
    }),
    outputSchema: z.object({
      ads: z.array(
        z.object({
          resourceName: z.string(),
          adId: z.string(),
          adName: z.string().optional(),
          adType: z.string(),
          adGroup: z.string(),
          status: z.string(),
          finalUrls: z.array(z.string()).optional(),
          approvalStatus: z.string().optional(),
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

      const ads = await client.listAds(context.customerId, context.adGroupId);

      return {
        ads: ads.map((adGroupAd) => ({
          resourceName: adGroupAd.resourceName,
          adId: adGroupAd.ad.id,
          adName: adGroupAd.ad.name,
          adType: adGroupAd.ad.type,
          adGroup: adGroupAd.adGroup,
          status: adGroupAd.status,
          finalUrls: adGroupAd.ad.finalUrls,
          approvalStatus: adGroupAd.policySummary?.approvalStatus,
        })),
        count: ads.length,
      };
    },
  });

// ============================================================================
// Get Ad Tool
// ============================================================================

export const createGetAdTool = (env: Env) =>
  createPrivateTool({
    id: "get_ad",
    description:
      "Get detailed information about a specific Google Ads ad including creative content.",
    inputSchema: z.object({
      customerId: z
        .string()
        .describe("Google Ads customer ID (e.g., '1234567890')"),
      adGroupId: z.string().describe("Ad group ID"),
      adId: z.string().describe("Ad ID"),
    }),
    outputSchema: z.object({
      ad: z
        .object({
          resourceName: z.string(),
          adId: z.string(),
          adName: z.string().optional(),
          adType: z.string(),
          adGroup: z.string(),
          status: z.string(),
          finalUrls: z.array(z.string()).optional(),
          displayUrl: z.string().optional(),
          approvalStatus: z.string().optional(),
          responsiveSearchAd: z
            .object({
              headlines: z.array(z.object({ text: z.string() })),
              descriptions: z.array(z.object({ text: z.string() })),
              path1: z.string().optional(),
              path2: z.string().optional(),
            })
            .optional(),
        })
        .nullable(),
    }),
    execute: async ({ context }) => {
        const developerToken = env.MESH_REQUEST_CONTEXT?.state?.developerToken || 
                              process.env.GOOGLE_ADS_DEVELOPER_TOKEN ||
                              "NSC8PQesrKHxJCsygni2A";
        
        const client = new GoogleAdsClient({
          accessToken: getAccessToken(env),
          developerToken,
        });

      const adGroupAd = await client.getAd(
        context.customerId,
        context.adGroupId,
        context.adId,
      );

      if (!adGroupAd) {
        return { ad: null };
      }

      return {
        ad: {
          resourceName: adGroupAd.resourceName,
          adId: adGroupAd.ad.id,
          adName: adGroupAd.ad.name,
          adType: adGroupAd.ad.type,
          adGroup: adGroupAd.adGroup,
          status: adGroupAd.status,
          finalUrls: adGroupAd.ad.finalUrls,
          displayUrl: adGroupAd.ad.displayUrl,
          approvalStatus: adGroupAd.policySummary?.approvalStatus,
          responsiveSearchAd: adGroupAd.ad.responsiveSearchAd,
        },
      };
    },
  });

// ============================================================================
// Create Responsive Search Ad Tool
// ============================================================================

export const createCreateResponsiveSearchAdTool = (env: Env) =>
  createPrivateTool({
    id: "create_responsive_search_ad",
    description:
      "Create a new Responsive Search Ad (RSA) in a Google Ads ad group. RSAs automatically test different headline and description combinations.",
    inputSchema: z.object({
      customerId: z
        .string()
        .describe("Google Ads customer ID (e.g., '1234567890')"),
      adGroupResourceName: z
        .string()
        .describe(
          "Ad group resource name (e.g., 'customers/123/adGroups/456')",
        ),
      finalUrls: z
        .array(z.string())
        .describe("Landing page URLs (usually just one URL)"),
      headlines: z
        .array(z.string())
        .min(3)
        .max(15)
        .describe("Ad headlines (3-15 headlines, each max 30 characters)"),
      descriptions: z
        .array(z.string())
        .min(2)
        .max(4)
        .describe("Ad descriptions (2-4 descriptions, each max 90 characters)"),
      path1: z
        .string()
        .optional()
        .describe("Display URL path 1 (max 15 characters)"),
      path2: z
        .string()
        .optional()
        .describe("Display URL path 2 (max 15 characters, requires path1)"),
      status: z
        .enum(["ENABLED", "PAUSED"])
        .optional()
        .default("PAUSED")
        .describe("Initial ad status (default: PAUSED)"),
    }),
    outputSchema: z.object({
      resourceName: z.string().describe("Created ad resource name"),
      success: z.boolean(),
    }),
    execute: async ({ context }) => {
        const developerToken = env.MESH_REQUEST_CONTEXT?.state?.developerToken || 
                              process.env.GOOGLE_ADS_DEVELOPER_TOKEN ||
                              "NSC8PQesrKHxJCsygni2A";
        
        const client = new GoogleAdsClient({
          accessToken: getAccessToken(env),
          developerToken,
        });

      const response = await client.createResponsiveSearchAd(
        context.customerId,
        {
          adGroup: context.adGroupResourceName,
          status: (context.status || "PAUSED") as AdGroupAdStatus,
          finalUrls: context.finalUrls,
          headlines: context.headlines.map((text) => ({ text })),
          descriptions: context.descriptions.map((text) => ({ text })),
          path1: context.path1,
          path2: context.path2,
        },
      );

      const resourceName = response.results[0]?.resourceName;
      if (!resourceName) {
        throw new Error("Failed to create ad");
      }

      return {
        resourceName,
        success: true,
      };
    },
  });

// ============================================================================
// Pause Ad Tool
// ============================================================================

export const createPauseAdTool = (env: Env) =>
  createPrivateTool({
    id: "pause_ad",
    description: "Pause a Google Ads ad. Sets the ad status to PAUSED.",
    inputSchema: z.object({
      customerId: z
        .string()
        .describe("Google Ads customer ID (e.g., '1234567890')"),
      adResourceName: z
        .string()
        .describe(
          "Ad resource name (e.g., 'customers/123/adGroupAds/456~789')",
        ),
    }),
    outputSchema: z.object({
      resourceName: z.string(),
      success: z.boolean(),
    }),
    execute: async ({ context }) => {
        const developerToken = env.MESH_REQUEST_CONTEXT?.state?.developerToken || 
                              process.env.GOOGLE_ADS_DEVELOPER_TOKEN ||
                              "NSC8PQesrKHxJCsygni2A";
        
        const client = new GoogleAdsClient({
          accessToken: getAccessToken(env),
          developerToken,
        });

      await client.updateAdStatus(
        context.customerId,
        context.adResourceName,
        "PAUSED",
      );

      return {
        resourceName: context.adResourceName,
        success: true,
      };
    },
  });

// ============================================================================
// Enable Ad Tool
// ============================================================================

export const createEnableAdTool = (env: Env) =>
  createPrivateTool({
    id: "enable_ad",
    description: "Enable a Google Ads ad. Sets the ad status to ENABLED.",
    inputSchema: z.object({
      customerId: z
        .string()
        .describe("Google Ads customer ID (e.g., '1234567890')"),
      adResourceName: z
        .string()
        .describe(
          "Ad resource name (e.g., 'customers/123/adGroupAds/456~789')",
        ),
    }),
    outputSchema: z.object({
      resourceName: z.string(),
      success: z.boolean(),
    }),
    execute: async ({ context }) => {
        const developerToken = env.MESH_REQUEST_CONTEXT?.state?.developerToken || 
                              process.env.GOOGLE_ADS_DEVELOPER_TOKEN ||
                              "NSC8PQesrKHxJCsygni2A";
        
        const client = new GoogleAdsClient({
          accessToken: getAccessToken(env),
          developerToken,
        });

      await client.updateAdStatus(
        context.customerId,
        context.adResourceName,
        "ENABLED",
      );

      return {
        resourceName: context.adResourceName,
        success: true,
      };
    },
  });

// ============================================================================
// Export all ad tools
// ============================================================================

export const adTools = [
  createListAdsTool,
  createGetAdTool,
  createCreateResponsiveSearchAdTool,
  createPauseAdTool,
  createEnableAdTool,
];
