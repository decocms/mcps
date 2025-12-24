/**
 * Campaign-related tools for Meta Ads
 *
 * Tools:
 * - META_ADS_GET_CAMPAIGNS: List campaigns with optional filtering
 * - META_ADS_GET_CAMPAIGN_DETAILS: Get detailed info about a specific campaign
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
      limit: z
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
      const accessToken = getMetaAccessToken(env);
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
      const accessToken = getMetaAccessToken(env);
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

// Export all campaign tools
export const campaignTools = [
  createGetCampaignsTool,
  createGetCampaignDetailsTool,
];
