/**
 * AdSet-related tools for Meta Ads
 *
 * Tools:
 * - META_ADS_GET_ADSETS: List ad sets with optional filtering by campaign
 * - META_ADS_GET_ADSET_DETAILS: Get detailed info about a specific ad set
 * - META_ADS_CREATE_ADSET: Create a new ad set
 * - META_ADS_UPDATE_ADSET: Update an existing ad set
 * - META_ADS_DELETE_ADSET: Delete an ad set
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
      limit: z.coerce
        .number()
        .optional()
        .prefault(50)
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
      const accessToken = await getMetaAccessToken(env);
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
      promoted_object: z.record(z.string(), z.unknown()).optional(),
    }),
    execute: async ({ context }) => {
      const accessToken = await getMetaAccessToken(env);
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

// Targeting input schema for creating/updating ad sets
const targetingInputSchema = z.object({
  age_min: z.number().optional().describe("Minimum age (18-65)"),
  age_max: z.number().optional().describe("Maximum age (18-65)"),
  genders: z
    .array(z.number())
    .optional()
    .describe("Gender targeting: 1 = male, 2 = female. Empty for all."),
  geo_locations: z
    .object({
      countries: z
        .array(z.string())
        .optional()
        .describe("Array of country codes (e.g., ['US', 'BR', 'GB'])"),
      regions: z
        .array(z.object({ key: z.string() }))
        .optional()
        .describe("Array of region keys"),
      cities: z
        .array(
          z.object({
            key: z.string(),
            radius: z.number().optional(),
            distance_unit: z.string().optional(),
          }),
        )
        .optional()
        .describe("Array of city keys with optional radius"),
      location_types: z.array(z.string()).optional(),
    })
    .optional()
    .describe("Geographic targeting"),
  interests: z
    .array(z.object({ id: z.string() }))
    .optional()
    .describe("Array of interest IDs for targeting"),
  behaviors: z
    .array(z.object({ id: z.string() }))
    .optional()
    .describe("Array of behavior IDs for targeting"),
  custom_audiences: z
    .array(z.object({ id: z.string() }))
    .optional()
    .describe("Array of custom audience IDs"),
  excluded_custom_audiences: z
    .array(z.object({ id: z.string() }))
    .optional()
    .describe("Array of custom audience IDs to exclude"),
  publisher_platforms: z
    .array(z.enum(["facebook", "instagram", "audience_network", "messenger"]))
    .optional()
    .describe("Platforms to show ads on"),
  facebook_positions: z.array(z.string()).optional(),
  instagram_positions: z.array(z.string()).optional(),
  device_platforms: z
    .array(z.enum(["mobile", "desktop"]))
    .optional()
    .describe("Device types to target"),
});

/**
 * Create a new ad set
 */
export const createCreateAdSetTool = (env: Env) =>
  createPrivateTool({
    id: "META_ADS_CREATE_ADSET",
    description:
      "Create a new Meta Ads ad set. This is STEP 2 of 5 to create ads. REQUIRES: A campaign_id from CREATE_CAMPAIGN. FLOW: 1) CREATE_CAMPAIGN → 2) CREATE_ADSET → 3) UPLOAD_AD_IMAGE (optional) → 4) CREATE_AD_CREATIVE → 5) CREATE_AD. Define targeting, budget, optimization goal, and billing settings.",
    inputSchema: z.object({
      account_id: z
        .string()
        .describe("Meta Ads account ID (format: act_XXXXXXXXX)"),
      campaign_id: z.string().describe("Campaign ID to create the ad set in"),
      name: z.string().describe("Ad set name"),
      status: z
        .enum(["ACTIVE", "PAUSED"])
        .optional()
        .default("PAUSED")
        .describe("Ad set status (default: PAUSED)"),
      targeting: targetingInputSchema.describe(
        "Targeting specifications for the ad set",
      ),
      optimization_goal: z
        .enum([
          "NONE",
          "APP_INSTALLS",
          "AD_RECALL_LIFT",
          "ENGAGED_USERS",
          "EVENT_RESPONSES",
          "IMPRESSIONS",
          "LEAD_GENERATION",
          "QUALITY_LEAD",
          "LINK_CLICKS",
          "OFFSITE_CONVERSIONS",
          "PAGE_LIKES",
          "POST_ENGAGEMENT",
          "REACH",
          "LANDING_PAGE_VIEWS",
          "VALUE",
          "THRUPLAY",
          "CONVERSATIONS",
        ])
        .describe(
          "What to optimize for. LINK_CLICKS for traffic, LANDING_PAGE_VIEWS for quality traffic, LEAD_GENERATION for leads, OFFSITE_CONVERSIONS for purchases, IMPRESSIONS for reach.",
        ),
      billing_event: z
        .enum([
          "APP_INSTALLS",
          "CLICKS",
          "IMPRESSIONS",
          "LINK_CLICKS",
          "NONE",
          "PAGE_LIKES",
          "POST_ENGAGEMENT",
          "THRUPLAY",
        ])
        .describe(
          "When you get charged. IMPRESSIONS is most common, LINK_CLICKS for CPC campaigns, THRUPLAY for video views.",
        ),
      bid_strategy: z
        .enum([
          "LOWEST_COST_WITHOUT_CAP",
          "LOWEST_COST_WITH_BID_CAP",
          "COST_CAP",
        ])
        .optional()
        .describe("Bid strategy (default: LOWEST_COST_WITHOUT_CAP)"),
      bid_amount: z
        .string()
        .optional()
        .describe("Bid amount in cents (required for bid cap strategies)"),
      daily_budget: z
        .string()
        .optional()
        .describe(
          "Daily budget in cents (e.g., '5000' for $50.00). Required if campaign doesn't use Campaign Budget Optimization.",
        ),
      lifetime_budget: z
        .string()
        .optional()
        .describe(
          "Lifetime budget in cents. Requires start_time and end_time.",
        ),
      start_time: z
        .string()
        .optional()
        .describe("Start time in ISO 8601 format"),
      end_time: z
        .string()
        .optional()
        .describe("End time in ISO 8601 format (required for lifetime_budget)"),
      promoted_object: z
        .object({
          page_id: z.string().optional().describe("Facebook Page ID"),
          pixel_id: z
            .string()
            .optional()
            .describe("Meta Pixel ID for conversion tracking"),
          application_id: z
            .string()
            .optional()
            .describe("App ID for app promotion"),
          custom_event_type: z
            .string()
            .optional()
            .describe("Custom conversion event type (e.g., PURCHASE, LEAD)"),
        })
        .optional()
        .describe("Object being promoted (page, pixel, or app)"),
      destination_type: z
        .enum([
          "WEBSITE",
          "APP",
          "MESSENGER",
          "WHATSAPP",
          "INSTAGRAM_DIRECT",
          "FACEBOOK",
        ])
        .optional()
        .describe("Where users are sent after clicking"),
    }),
    outputSchema: z.object({
      id: z.string().describe("ID of the created ad set"),
      success: z
        .boolean()
        .describe("Whether the ad set was created successfully"),
    }),
    execute: async ({ context }) => {
      const accessToken = await getMetaAccessToken(env);
      const client = createMetaAdsClient({ accessToken });

      const response = await client.createAdSet(context.account_id, {
        campaign_id: context.campaign_id,
        name: context.name,
        status: context.status,
        targeting: context.targeting,
        optimization_goal: context.optimization_goal,
        billing_event: context.billing_event,
        bid_strategy: context.bid_strategy,
        bid_amount: context.bid_amount,
        daily_budget: context.daily_budget,
        lifetime_budget: context.lifetime_budget,
        start_time: context.start_time,
        end_time: context.end_time,
        promoted_object: context.promoted_object,
        destination_type: context.destination_type,
      });

      return {
        id: response.id || "",
        success: !!response.id,
      };
    },
  });

/**
 * Update an existing ad set
 */
export const createUpdateAdSetTool = (env: Env) =>
  createPrivateTool({
    id: "META_ADS_UPDATE_ADSET",
    description:
      "Update an existing Meta Ads ad set. Can change targeting, budget, status, or optimization settings.",
    inputSchema: z.object({
      adset_id: z.string().describe("Ad set ID to update"),
      name: z.string().optional().describe("New ad set name"),
      status: z
        .enum(["ACTIVE", "PAUSED", "DELETED", "ARCHIVED"])
        .optional()
        .describe("New status. Use PAUSED to pause, ACTIVE to activate."),
      targeting: targetingInputSchema
        .optional()
        .describe("New targeting settings"),
      optimization_goal: z
        .enum([
          "NONE",
          "APP_INSTALLS",
          "AD_RECALL_LIFT",
          "ENGAGED_USERS",
          "EVENT_RESPONSES",
          "IMPRESSIONS",
          "LEAD_GENERATION",
          "QUALITY_LEAD",
          "LINK_CLICKS",
          "OFFSITE_CONVERSIONS",
          "PAGE_LIKES",
          "POST_ENGAGEMENT",
          "REACH",
          "LANDING_PAGE_VIEWS",
          "VALUE",
          "THRUPLAY",
          "CONVERSATIONS",
        ])
        .optional()
        .describe("New optimization goal"),
      billing_event: z
        .enum([
          "APP_INSTALLS",
          "CLICKS",
          "IMPRESSIONS",
          "LINK_CLICKS",
          "NONE",
          "PAGE_LIKES",
          "POST_ENGAGEMENT",
          "THRUPLAY",
        ])
        .optional()
        .describe("New billing event"),
      bid_strategy: z
        .enum([
          "LOWEST_COST_WITHOUT_CAP",
          "LOWEST_COST_WITH_BID_CAP",
          "COST_CAP",
        ])
        .optional()
        .describe("New bid strategy"),
      bid_amount: z.string().optional().describe("New bid amount in cents"),
      daily_budget: z.string().optional().describe("New daily budget in cents"),
      lifetime_budget: z
        .string()
        .optional()
        .describe("New lifetime budget in cents"),
      start_time: z.string().optional().describe("New start time"),
      end_time: z.string().optional().describe("New end time"),
    }),
    outputSchema: z.object({
      success: z.boolean().describe("Whether the update was successful"),
    }),
    execute: async ({ context }) => {
      const accessToken = await getMetaAccessToken(env);
      const client = createMetaAdsClient({ accessToken });

      const response = await client.updateAdSet(context.adset_id, {
        name: context.name,
        status: context.status,
        targeting: context.targeting,
        optimization_goal: context.optimization_goal,
        billing_event: context.billing_event,
        bid_strategy: context.bid_strategy,
        bid_amount: context.bid_amount,
        daily_budget: context.daily_budget,
        lifetime_budget: context.lifetime_budget,
        start_time: context.start_time,
        end_time: context.end_time,
      });

      return {
        success: response.success ?? true,
      };
    },
  });

/**
 * Delete an ad set
 */
export const createDeleteAdSetTool = (env: Env) =>
  createPrivateTool({
    id: "META_ADS_DELETE_ADSET",
    description:
      "Delete a Meta Ads ad set. This action cannot be undone. All ads in the ad set will also be deleted.",
    inputSchema: z.object({
      adset_id: z.string().describe("Ad set ID to delete"),
    }),
    outputSchema: z.object({
      success: z.boolean().describe("Whether the deletion was successful"),
    }),
    execute: async ({ context }) => {
      const accessToken = await getMetaAccessToken(env);
      const client = createMetaAdsClient({ accessToken });

      const response = await client.deleteAdSet(context.adset_id);

      return {
        success: response.success,
      };
    },
  });

// Export all adset tools
export const adsetTools = [
  createGetAdSetsTool,
  createGetAdSetDetailsTool,
  createCreateAdSetTool,
  createUpdateAdSetTool,
  createDeleteAdSetTool,
];
