/**
 * Campaign Management Tools
 *
 * Tools for listing, creating, updating, and managing Google Ads campaigns
 */

import { createPrivateTool } from "@decocms/runtime/tools";
import { z } from "zod";
import type { Env } from "../main.ts";
import { GoogleAdsClient, getAccessToken } from "../lib/google-ads-client.ts";
import type { CampaignStatus, AdvertisingChannelType } from "../lib/types.ts";

// ============================================================================
// List Campaigns Tool
// ============================================================================

export const createListCampaignsTool = (env: Env) =>
  createPrivateTool({
    id: "list_campaigns",
    description:
      "List all campaigns for a Google Ads customer account. Can optionally filter by status.",
    inputSchema: z.object({
      customerId: z
        .string()
        .describe("Google Ads customer ID (e.g., '1234567890')"),
      statusFilter: z
        .enum(["ENABLED", "PAUSED", "REMOVED"])
        .optional()
        .describe("Filter campaigns by status"),
    }),
    outputSchema: z.object({
      campaigns: z.array(
        z.object({
          resourceName: z.string(),
          id: z.string(),
          name: z.string(),
          status: z.string(),
          advertisingChannelType: z.string(),
          advertisingChannelSubType: z.string().optional(),
          biddingStrategyType: z.string().optional(),
          startDate: z.string().optional(),
          endDate: z.string().optional(),
          servingStatus: z.string().optional(),
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

      const campaigns = await client.listCampaigns(
        context.customerId,
        context.statusFilter as CampaignStatus | undefined,
      );

      return {
        campaigns: campaigns.map((campaign) => ({
          resourceName: campaign.resourceName,
          id: campaign.id,
          name: campaign.name,
          status: campaign.status,
          advertisingChannelType: campaign.advertisingChannelType,
          advertisingChannelSubType: campaign.advertisingChannelSubType,
          biddingStrategyType: campaign.biddingStrategyType,
          startDate: campaign.startDate,
          endDate: campaign.endDate,
          servingStatus: campaign.servingStatus,
        })),
        count: campaigns.length,
      };
    },
  });

// ============================================================================
// Get Campaign Tool
// ============================================================================

export const createGetCampaignTool = (env: Env) =>
  createPrivateTool({
    id: "get_campaign",
    description:
      "Get detailed information about a specific Google Ads campaign including settings and configuration.",
    inputSchema: z.object({
      customerId: z
        .string()
        .describe("Google Ads customer ID (e.g., '1234567890')"),
      campaignId: z.string().describe("Campaign ID"),
    }),
    outputSchema: z.object({
      campaign: z
        .object({
          resourceName: z.string(),
          id: z.string(),
          name: z.string(),
          status: z.string(),
          advertisingChannelType: z.string(),
          advertisingChannelSubType: z.string().optional(),
          biddingStrategyType: z.string().optional(),
          startDate: z.string().optional(),
          endDate: z.string().optional(),
          campaignBudget: z.string().optional(),
          servingStatus: z.string().optional(),
          networkSettings: z
            .object({
              targetGoogleSearch: z.boolean().optional(),
              targetSearchNetwork: z.boolean().optional(),
              targetContentNetwork: z.boolean().optional(),
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

      const campaign = await client.getCampaign(
        context.customerId,
        context.campaignId,
      );

      if (!campaign) {
        return { campaign: null };
      }

      return {
        campaign: {
          resourceName: campaign.resourceName,
          id: campaign.id,
          name: campaign.name,
          status: campaign.status,
          advertisingChannelType: campaign.advertisingChannelType,
          advertisingChannelSubType: campaign.advertisingChannelSubType,
          biddingStrategyType: campaign.biddingStrategyType,
          startDate: campaign.startDate,
          endDate: campaign.endDate,
          campaignBudget: campaign.campaignBudget,
          servingStatus: campaign.servingStatus,
          networkSettings: campaign.networkSettings,
        },
      };
    },
  });

// ============================================================================
// Create Campaign Tool
// ============================================================================

export const createCreateCampaignTool = (env: Env) =>
  createPrivateTool({
    id: "create_campaign",
    description:
      "Create a new Google Ads campaign. First create a campaign budget, then create the campaign with the budget resource name.",
    inputSchema: z.object({
      customerId: z
        .string()
        .describe("Google Ads customer ID (e.g., '1234567890')"),
      name: z.string().describe("Campaign name"),
      advertisingChannelType: z
        .enum([
          "SEARCH",
          "DISPLAY",
          "SHOPPING",
          "VIDEO",
          "PERFORMANCE_MAX",
          "DEMAND_GEN",
          "LOCAL",
          "SMART",
          "HOTEL",
          "LOCAL_SERVICES",
          "TRAVEL",
          "DISCOVERY",
        ])
        .describe("Campaign type (e.g., SEARCH, DISPLAY, VIDEO)"),
      budgetAmountMicros: z
        .string()
        .describe(
          "Daily budget amount in micros (1 dollar = 1,000,000 micros). E.g., '10000000' for $10",
        ),
      budgetName: z
        .string()
        .optional()
        .describe("Budget name (defaults to campaign name + ' Budget')"),
      status: z
        .enum(["ENABLED", "PAUSED"])
        .optional()
        .default("PAUSED")
        .describe("Initial campaign status (default: PAUSED)"),
      startDate: z
        .string()
        .optional()
        .describe("Campaign start date (YYYY-MM-DD format)"),
      endDate: z
        .string()
        .optional()
        .describe("Campaign end date (YYYY-MM-DD format)"),
      targetGoogleSearch: z
        .boolean()
        .optional()
        .describe("Target Google Search (for SEARCH campaigns)"),
      targetSearchNetwork: z
        .boolean()
        .optional()
        .describe("Target Search Network partners"),
      targetContentNetwork: z
        .boolean()
        .optional()
        .describe("Target Display Network"),
      manualCpcEnabled: z
        .boolean()
        .optional()
        .describe("Use Manual CPC bidding strategy"),
      enhancedCpcEnabled: z
        .boolean()
        .optional()
        .describe("Enable Enhanced CPC (only with Manual CPC)"),
    }),
    outputSchema: z.object({
      campaignResourceName: z
        .string()
        .describe("Created campaign resource name"),
      budgetResourceName: z.string().describe("Created budget resource name"),
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

      // First, create the campaign budget
      const budgetResponse = await client.createCampaignBudget(
        context.customerId,
        {
          name: context.budgetName || `${context.name} Budget`,
          amountMicros: context.budgetAmountMicros,
          deliveryMethod: "STANDARD",
        },
      );

      const budgetResourceName = budgetResponse.results[0]?.resourceName;
      if (!budgetResourceName) {
        throw new Error("Failed to create campaign budget");
      }

      // Build network settings if any are specified
      const networkSettings =
        context.targetGoogleSearch !== undefined ||
        context.targetSearchNetwork !== undefined ||
        context.targetContentNetwork !== undefined
          ? {
              targetGoogleSearch: context.targetGoogleSearch,
              targetSearchNetwork: context.targetSearchNetwork,
              targetContentNetwork: context.targetContentNetwork,
            }
          : undefined;

      // Build manual CPC settings if specified
      const manualCpc = context.manualCpcEnabled
        ? { enhancedCpcEnabled: context.enhancedCpcEnabled }
        : undefined;

      // Then, create the campaign
      const campaignResponse = await client.createCampaign(context.customerId, {
        name: context.name,
        advertisingChannelType:
          context.advertisingChannelType as AdvertisingChannelType,
        status: (context.status || "PAUSED") as CampaignStatus,
        campaignBudget: budgetResourceName,
        startDate: context.startDate,
        endDate: context.endDate,
        networkSettings,
        manualCpc,
      });

      const campaignResourceName = campaignResponse.results[0]?.resourceName;
      if (!campaignResourceName) {
        throw new Error("Failed to create campaign");
      }

      return {
        campaignResourceName,
        budgetResourceName,
        success: true,
      };
    },
  });

// ============================================================================
// Update Campaign Tool
// ============================================================================

export const createUpdateCampaignTool = (env: Env) =>
  createPrivateTool({
    id: "update_campaign",
    description:
      "Update an existing Google Ads campaign. Can change name, status, dates, and network settings.",
    inputSchema: z.object({
      customerId: z
        .string()
        .describe("Google Ads customer ID (e.g., '1234567890')"),
      campaignResourceName: z
        .string()
        .describe(
          "Campaign resource name (e.g., 'customers/123/campaigns/456')",
        ),
      name: z.string().optional().describe("New campaign name"),
      status: z
        .enum(["ENABLED", "PAUSED", "REMOVED"])
        .optional()
        .describe("New campaign status"),
      startDate: z
        .string()
        .optional()
        .describe("New start date (YYYY-MM-DD format)"),
      endDate: z
        .string()
        .optional()
        .describe("New end date (YYYY-MM-DD format)"),
      targetGoogleSearch: z.boolean().optional(),
      targetSearchNetwork: z.boolean().optional(),
      targetContentNetwork: z.boolean().optional(),
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

      const networkSettings =
        context.targetGoogleSearch !== undefined ||
        context.targetSearchNetwork !== undefined ||
        context.targetContentNetwork !== undefined
          ? {
              targetGoogleSearch: context.targetGoogleSearch,
              targetSearchNetwork: context.targetSearchNetwork,
              targetContentNetwork: context.targetContentNetwork,
            }
          : undefined;

      const response = await client.updateCampaign(context.customerId, {
        resourceName: context.campaignResourceName,
        name: context.name,
        status: context.status as CampaignStatus | undefined,
        startDate: context.startDate,
        endDate: context.endDate,
        networkSettings,
      });

      return {
        resourceName:
          response.results[0]?.resourceName || context.campaignResourceName,
        success: true,
      };
    },
  });

// ============================================================================
// Pause Campaign Tool
// ============================================================================

export const createPauseCampaignTool = (env: Env) =>
  createPrivateTool({
    id: "pause_campaign",
    description:
      "Pause a Google Ads campaign. Sets the campaign status to PAUSED.",
    inputSchema: z.object({
      customerId: z
        .string()
        .describe("Google Ads customer ID (e.g., '1234567890')"),
      campaignResourceName: z
        .string()
        .describe(
          "Campaign resource name (e.g., 'customers/123/campaigns/456')",
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

      await client.updateCampaignStatus(
        context.customerId,
        context.campaignResourceName,
        "PAUSED",
      );

      return {
        resourceName: context.campaignResourceName,
        success: true,
      };
    },
  });

// ============================================================================
// Enable Campaign Tool
// ============================================================================

export const createEnableCampaignTool = (env: Env) =>
  createPrivateTool({
    id: "enable_campaign",
    description:
      "Enable a Google Ads campaign. Sets the campaign status to ENABLED.",
    inputSchema: z.object({
      customerId: z
        .string()
        .describe("Google Ads customer ID (e.g., '1234567890')"),
      campaignResourceName: z
        .string()
        .describe(
          "Campaign resource name (e.g., 'customers/123/campaigns/456')",
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

      await client.updateCampaignStatus(
        context.customerId,
        context.campaignResourceName,
        "ENABLED",
      );

      return {
        resourceName: context.campaignResourceName,
        success: true,
      };
    },
  });

// ============================================================================
// Export all campaign tools
// ============================================================================

export const campaignTools = [
  createListCampaignsTool,
  createGetCampaignTool,
  createCreateCampaignTool,
  createUpdateCampaignTool,
  createPauseCampaignTool,
  createEnableCampaignTool,
];
