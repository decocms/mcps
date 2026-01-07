/**
 * Campaign-related tools for Meta Ads
 *
 * Tools:
 * - META_ADS_GET_CAMPAIGNS: List campaigns with optional filtering
 * - META_ADS_GET_CAMPAIGN_DETAILS: Get detailed info about a specific campaign
 * - META_ADS_CREATE_CAMPAIGN: Create a new campaign
 * - META_ADS_UPDATE_CAMPAIGN: Update an existing campaign
 * - META_ADS_DELETE_CAMPAIGN: Delete a campaign
 */

import { createPrivateTool } from "@decocms/runtime/tools";
import { z } from "zod";
import type { Env } from "../main.ts";
import { getMetaAccessToken } from "../main.ts";
import { createMetaAdsClient } from "../lib/meta-client.ts";

/**
 * Get campaigns for an ad account
 */
export const createGetCampaignsTool = (env: Env) =>
  createPrivateTool({
    id: "META_ADS_GET_CAMPAIGNS",
    description:
      "Get campaigns for a Meta Ads account. Can filter by status (ACTIVE, PAUSED, etc). Returns campaign details including objective, budget, and status.",
    inputSchema: z.object({
      account_id: z
        .string()
        .describe("Meta Ads account ID (format: act_XXXXXXXXX)"),
      limit: z.coerce
        .number()
        .optional()
        .default(50)
        .describe("Maximum number of campaigns to return (default: 50)"),
      status_filter: z
        .enum(["ACTIVE", "PAUSED", "DELETED", "ARCHIVED"])
        .optional()
        .describe(
          "Filter by campaign status. Leave empty to get all campaigns.",
        ),
    }),
    outputSchema: z.object({
      campaigns: z.array(
        z.object({
          id: z.string(),
          name: z.string(),
          objective: z.string(),
          status: z.string(),
          effective_status: z.string(),
          created_time: z.string(),
          updated_time: z.string(),
          daily_budget: z.string().optional(),
          lifetime_budget: z.string().optional(),
          budget_remaining: z.string().optional(),
          buying_type: z.string().optional(),
          special_ad_categories: z.array(z.string()).optional(),
        }),
      ),
      count: z.number().describe("Number of campaigns returned"),
    }),
    execute: async ({ context }) => {
      const accessToken = await getMetaAccessToken(env);
      const client = createMetaAdsClient({ accessToken });

      const response = await client.getCampaigns(context.account_id, {
        limit: context.limit,
        statusFilter: context.status_filter,
      });

      return {
        campaigns: response.data.map((campaign) => ({
          id: campaign.id,
          name: campaign.name,
          objective: campaign.objective,
          status: campaign.status,
          effective_status: campaign.effective_status,
          created_time: campaign.created_time,
          updated_time: campaign.updated_time,
          daily_budget: campaign.daily_budget,
          lifetime_budget: campaign.lifetime_budget,
          budget_remaining: campaign.budget_remaining,
          buying_type: campaign.buying_type,
          special_ad_categories: campaign.special_ad_categories,
        })),
        count: response.data.length,
      };
    },
  });

/**
 * Get details of a specific campaign
 */
export const createGetCampaignDetailsTool = (env: Env) =>
  createPrivateTool({
    id: "META_ADS_GET_CAMPAIGN_DETAILS",
    description:
      "Get detailed information about a specific Meta Ads campaign including objective, budget, schedule, and status.",
    inputSchema: z.object({
      campaign_id: z.string().describe("Meta Ads campaign ID"),
    }),
    outputSchema: z.object({
      id: z.string(),
      name: z.string(),
      objective: z.string(),
      status: z.string(),
      effective_status: z.string(),
      created_time: z.string(),
      updated_time: z.string(),
      start_time: z.string().optional(),
      stop_time: z.string().optional(),
      daily_budget: z.string().optional(),
      lifetime_budget: z.string().optional(),
      budget_remaining: z.string().optional(),
      buying_type: z.string().optional(),
      special_ad_categories: z.array(z.string()).optional(),
    }),
    execute: async ({ context }) => {
      const accessToken = await getMetaAccessToken(env);
      const client = createMetaAdsClient({ accessToken });

      const campaign = await client.getCampaignDetails(context.campaign_id);

      return {
        id: campaign.id,
        name: campaign.name,
        objective: campaign.objective,
        status: campaign.status,
        effective_status: campaign.effective_status,
        created_time: campaign.created_time,
        updated_time: campaign.updated_time,
        start_time: campaign.start_time,
        stop_time: campaign.stop_time,
        daily_budget: campaign.daily_budget,
        lifetime_budget: campaign.lifetime_budget,
        budget_remaining: campaign.budget_remaining,
        buying_type: campaign.buying_type,
        special_ad_categories: campaign.special_ad_categories,
      };
    },
  });

/**
 * Create a new campaign
 */
export const createCreateCampaignTool = (env: Env) =>
  createPrivateTool({
    id: "META_ADS_CREATE_CAMPAIGN",
    description:
      "Create a new Meta Ads campaign. This is STEP 1 of 5 to create ads. FLOW: 1) CREATE_CAMPAIGN → 2) CREATE_ADSET → 3) UPLOAD_AD_IMAGE (optional) → 4) CREATE_AD_CREATIVE → 5) CREATE_AD. Requires account ID, name, and objective. Budget can be set at campaign or ad set level.",
    inputSchema: z.object({
      account_id: z
        .string()
        .describe("Meta Ads account ID (format: act_XXXXXXXXX)"),
      name: z.string().describe("Campaign name"),
      objective: z
        .enum([
          "OUTCOME_AWARENESS",
          "OUTCOME_ENGAGEMENT",
          "OUTCOME_LEADS",
          "OUTCOME_SALES",
          "OUTCOME_TRAFFIC",
          "OUTCOME_APP_PROMOTION",
        ])
        .describe(
          "Campaign objective. OUTCOME_TRAFFIC for website visits, OUTCOME_ENGAGEMENT for interactions, OUTCOME_LEADS for lead generation, OUTCOME_SALES for conversions, OUTCOME_AWARENESS for reach/brand awareness, OUTCOME_APP_PROMOTION for app installs.",
        ),
      status: z
        .enum(["ACTIVE", "PAUSED"])
        .optional()
        .default("PAUSED")
        .describe("Campaign status (default: PAUSED)"),
      special_ad_categories: z
        .array(
          z.enum([
            "NONE",
            "HOUSING",
            "EMPLOYMENT",
            "CREDIT",
            "ISSUES_ELECTIONS_POLITICS",
          ]),
        )
        .optional()
        .describe(
          "Special ad categories for regulated content. Use NONE for regular ads, or specify if advertising housing, employment, credit, or political content.",
        ),
      daily_budget: z
        .string()
        .optional()
        .describe(
          "Daily budget in cents (e.g., '5000' for $50.00). Either daily_budget or lifetime_budget required if using Campaign Budget Optimization.",
        ),
      lifetime_budget: z
        .string()
        .optional()
        .describe(
          "Lifetime budget in cents (e.g., '100000' for $1000.00). Requires start_time and stop_time.",
        ),
      start_time: z
        .string()
        .optional()
        .describe(
          "Campaign start time in ISO 8601 format (e.g., 2024-01-15T00:00:00-0500)",
        ),
      stop_time: z
        .string()
        .optional()
        .describe(
          "Campaign end time in ISO 8601 format. Required if using lifetime_budget.",
        ),
      buying_type: z
        .enum(["AUCTION", "RESERVED"])
        .optional()
        .describe("Buying type (default: AUCTION)"),
      bid_strategy: z
        .enum([
          "LOWEST_COST_WITHOUT_CAP",
          "LOWEST_COST_WITH_BID_CAP",
          "COST_CAP",
        ])
        .optional()
        .describe("Bid strategy for the campaign"),
    }),
    outputSchema: z.object({
      id: z.string().describe("ID of the created campaign"),
      success: z
        .boolean()
        .describe("Whether the campaign was created successfully"),
    }),
    execute: async ({ context }) => {
      const accessToken = await getMetaAccessToken(env);
      const client = createMetaAdsClient({ accessToken });

      const response = await client.createCampaign(context.account_id, {
        name: context.name,
        objective: context.objective,
        status: context.status,
        special_ad_categories: context.special_ad_categories,
        daily_budget: context.daily_budget,
        lifetime_budget: context.lifetime_budget,
        start_time: context.start_time,
        stop_time: context.stop_time,
        buying_type: context.buying_type,
        bid_strategy: context.bid_strategy,
      });

      return {
        id: response.id || "",
        success: !!response.id,
      };
    },
  });

/**
 * Update an existing campaign
 */
export const createUpdateCampaignTool = (env: Env) =>
  createPrivateTool({
    id: "META_ADS_UPDATE_CAMPAIGN",
    description:
      "Update an existing Meta Ads campaign. Can change name, status, budget, or schedule. Use this to pause/activate campaigns.",
    inputSchema: z.object({
      campaign_id: z.string().describe("Campaign ID to update"),
      name: z.string().optional().describe("New campaign name"),
      status: z
        .enum(["ACTIVE", "PAUSED", "DELETED", "ARCHIVED"])
        .optional()
        .describe(
          "New campaign status. Use PAUSED to pause, ACTIVE to activate.",
        ),
      daily_budget: z.string().optional().describe("New daily budget in cents"),
      lifetime_budget: z
        .string()
        .optional()
        .describe("New lifetime budget in cents"),
      start_time: z
        .string()
        .optional()
        .describe("New start time in ISO 8601 format"),
      stop_time: z
        .string()
        .optional()
        .describe("New end time in ISO 8601 format"),
      bid_strategy: z
        .enum([
          "LOWEST_COST_WITHOUT_CAP",
          "LOWEST_COST_WITH_BID_CAP",
          "COST_CAP",
        ])
        .optional()
        .describe("New bid strategy"),
    }),
    outputSchema: z.object({
      success: z.boolean().describe("Whether the update was successful"),
    }),
    execute: async ({ context }) => {
      const accessToken = await getMetaAccessToken(env);
      const client = createMetaAdsClient({ accessToken });

      const response = await client.updateCampaign(context.campaign_id, {
        name: context.name,
        status: context.status,
        daily_budget: context.daily_budget,
        lifetime_budget: context.lifetime_budget,
        start_time: context.start_time,
        stop_time: context.stop_time,
        bid_strategy: context.bid_strategy,
      });

      return {
        success: response.success ?? true,
      };
    },
  });

/**
 * Delete a campaign
 */
export const createDeleteCampaignTool = (env: Env) =>
  createPrivateTool({
    id: "META_ADS_DELETE_CAMPAIGN",
    description:
      "Delete a Meta Ads campaign. This action cannot be undone. The campaign and all its ad sets and ads will be deleted.",
    inputSchema: z.object({
      campaign_id: z.string().describe("Campaign ID to delete"),
    }),
    outputSchema: z.object({
      success: z.boolean().describe("Whether the deletion was successful"),
    }),
    execute: async ({ context }) => {
      const accessToken = await getMetaAccessToken(env);
      const client = createMetaAdsClient({ accessToken });

      const response = await client.deleteCampaign(context.campaign_id);

      return {
        success: response.success,
      };
    },
  });

// Export all campaign tools
export const campaignTools = [
  createGetCampaignsTool,
  createGetCampaignDetailsTool,
  createCreateCampaignTool,
  createUpdateCampaignTool,
  createDeleteCampaignTool,
];
