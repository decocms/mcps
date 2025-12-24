/**
 * AdSet-related tools for Meta Ads
 *
 * Tools:
 * - META_ADS_GET_ADSETS: List ad sets with optional filtering by campaign
 * - META_ADS_GET_ADSET_DETAILS: Get detailed info about a specific ad set
 */

import { createPrivateTool } from "@decocms/runtime/tools";
import { z } from "zod";
import type { Env } from "../main.ts";
import { getMetaAccessToken } from "../main.ts";
import { createMetaAdsClient } from "../lib/meta-client.ts";

// Targeting schema for output
const targetingSummarySchema = z.object({
  age_min: z.number().optional(),
  age_max: z.number().optional(),
  genders: z.array(z.number()).optional(),
  countries: z.array(z.string()).optional(),
  interests_count: z.number().optional(),
  custom_audiences_count: z.number().optional(),
  publisher_platforms: z.array(z.string()).optional(),
});

/**
 * Get ad sets for an ad account
 */
export const createGetAdSetsTool = (env: Env) =>
  createPrivateTool({
    id: "META_ADS_GET_ADSETS",
    description:
      "Get ad sets for a Meta Ads account. Can filter by campaign ID. Returns ad set details including targeting, budget, and optimization settings.",
    inputSchema: z.object({
      account_id: z
        .string()
        .describe("Meta Ads account ID (format: act_XXXXXXXXX)"),
      limit: z
        .number()
        .optional()
        .default(50)
        .describe("Maximum number of ad sets to return (default: 50)"),
      campaign_id: z
        .string()
        .optional()
        .describe("Filter ad sets by campaign ID"),
    }),
    outputSchema: z.object({
      adsets: z.array(
        z.object({
          id: z.string(),
          name: z.string(),
          campaign_id: z.string(),
          status: z.string(),
          effective_status: z.string(),
          created_time: z.string(),
          daily_budget: z.string().optional(),
          lifetime_budget: z.string().optional(),
          budget_remaining: z.string().optional(),
          bid_strategy: z.string().optional(),
          optimization_goal: z.string().optional(),
          billing_event: z.string().optional(),
          targeting_summary: targetingSummarySchema.optional(),
        }),
      ),
      count: z.number().describe("Number of ad sets returned"),
    }),
    execute: async ({ context }) => {
      const accessToken = getMetaAccessToken(env);
      const client = createMetaAdsClient({ accessToken });

      const response = await client.getAdSets(context.account_id, {
        limit: context.limit,
        campaignId: context.campaign_id,
      });

      return {
        adsets: response.data.map((adset) => ({
          id: adset.id,
          name: adset.name,
          campaign_id: adset.campaign_id,
          status: adset.status,
          effective_status: adset.effective_status,
          created_time: adset.created_time,
          daily_budget: adset.daily_budget,
          lifetime_budget: adset.lifetime_budget,
          budget_remaining: adset.budget_remaining,
          bid_strategy: adset.bid_strategy,
          optimization_goal: adset.optimization_goal,
          billing_event: adset.billing_event,
          targeting_summary: adset.targeting
            ? {
                age_min: adset.targeting.age_min,
                age_max: adset.targeting.age_max,
                genders: adset.targeting.genders,
                countries: adset.targeting.geo_locations?.countries,
                interests_count: adset.targeting.interests?.length,
                custom_audiences_count:
                  adset.targeting.custom_audiences?.length,
                publisher_platforms: adset.targeting.publisher_platforms,
              }
            : undefined,
        })),
        count: response.data.length,
      };
    },
  });

/**
 * Get details of a specific ad set
 */
export const createGetAdSetDetailsTool = (env: Env) =>
  createPrivateTool({
    id: "META_ADS_GET_ADSET_DETAILS",
    description:
      "Get detailed information about a specific Meta Ads ad set including full targeting details, budget, schedule, and optimization settings.",
    inputSchema: z.object({
      adset_id: z.string().describe("Meta Ads ad set ID"),
    }),
    outputSchema: z.object({
      id: z.string(),
      name: z.string(),
      campaign_id: z.string(),
      status: z.string(),
      effective_status: z.string(),
      created_time: z.string(),
      updated_time: z.string(),
      start_time: z.string().optional(),
      end_time: z.string().optional(),
      daily_budget: z.string().optional(),
      lifetime_budget: z.string().optional(),
      budget_remaining: z.string().optional(),
      bid_amount: z.string().optional(),
      bid_strategy: z.string().optional(),
      billing_event: z.string().optional(),
      optimization_goal: z.string().optional(),
      targeting: z
        .object({
          age_min: z.number().optional(),
          age_max: z.number().optional(),
          genders: z.array(z.number()).optional(),
          geo_locations: z
            .object({
              countries: z.array(z.string()).optional(),
              regions: z
                .array(z.object({ key: z.string(), name: z.string() }))
                .optional(),
              cities: z
                .array(z.object({ key: z.string(), name: z.string() }))
                .optional(),
            })
            .optional(),
          interests: z
            .array(z.object({ id: z.string(), name: z.string() }))
            .optional(),
          behaviors: z
            .array(z.object({ id: z.string(), name: z.string() }))
            .optional(),
          custom_audiences: z
            .array(z.object({ id: z.string(), name: z.string() }))
            .optional(),
          publisher_platforms: z.array(z.string()).optional(),
          facebook_positions: z.array(z.string()).optional(),
          instagram_positions: z.array(z.string()).optional(),
          device_platforms: z.array(z.string()).optional(),
        })
        .optional(),
      promoted_object: z.record(z.unknown()).optional(),
    }),
    execute: async ({ context }) => {
      const accessToken = getMetaAccessToken(env);
      const client = createMetaAdsClient({ accessToken });

      const adset = await client.getAdSetDetails(context.adset_id);

      return {
        id: adset.id,
        name: adset.name,
        campaign_id: adset.campaign_id,
        status: adset.status,
        effective_status: adset.effective_status,
        created_time: adset.created_time,
        updated_time: adset.updated_time,
        start_time: adset.start_time,
        end_time: adset.end_time,
        daily_budget: adset.daily_budget,
        lifetime_budget: adset.lifetime_budget,
        budget_remaining: adset.budget_remaining,
        bid_amount: adset.bid_amount,
        bid_strategy: adset.bid_strategy,
        billing_event: adset.billing_event,
        optimization_goal: adset.optimization_goal,
        targeting: adset.targeting,
        promoted_object: adset.promoted_object,
      };
    },
  });

// Export all adset tools
export const adsetTools = [createGetAdSetsTool, createGetAdSetDetailsTool];
