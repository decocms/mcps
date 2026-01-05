/**
 * Ad-related tools for Meta Ads
 *
 * Tools:
 * - META_ADS_GET_ADS: List ads with optional filtering by campaign/adset
 * - META_ADS_GET_AD_DETAILS: Get detailed info about a specific ad
 * - META_ADS_GET_AD_CREATIVES: Get creative details for an ad
 */

import { createPrivateTool } from "@decocms/runtime/tools";
import { z } from "zod";
import type { Env } from "../main.ts";
import { getMetaAccessToken } from "../main.ts";
import { createMetaAdsClient } from "../lib/meta-client.ts";

/**
 * Get ads for an ad account
 */
export const createGetAdsTool = (env: Env) =>
  createPrivateTool({
    id: "META_ADS_GET_ADS",
    description:
      "Get ads for a Meta Ads account. Can filter by campaign ID or ad set ID. Returns ad details including status and creative reference.",
    inputSchema: z.object({
      account_id: z
        .string()
        .describe("Meta Ads account ID (format: act_XXXXXXXXX)"),
      limit: z.coerce
        .number()
        .optional()
        .prefault(50)
        .describe("Maximum number of ads to return (default: 50)"),
      campaign_id: z.string().optional().describe("Filter ads by campaign ID"),
      adset_id: z.string().optional().describe("Filter ads by ad set ID"),
    }),
    outputSchema: z.object({
      ads: z.array(
        z.object({
          id: z.string(),
          name: z.string(),
          adset_id: z.string(),
          campaign_id: z.string(),
          status: z.string(),
          effective_status: z.string(),
          created_time: z.string(),
          updated_time: z.string(),
          creative_id: z.string().optional(),
        }),
      ),
      count: z.number().describe("Number of ads returned"),
    }),
    execute: async ({ context }) => {
      const accessToken = await getMetaAccessToken(env);
      const client = createMetaAdsClient({ accessToken });

      const response = await client.getAds(context.account_id, {
        limit: context.limit,
        campaignId: context.campaign_id,
        adsetId: context.adset_id,
      });

      return {
        ads: response.data.map((ad) => ({
          id: ad.id,
          name: ad.name,
          adset_id: ad.adset_id,
          campaign_id: ad.campaign_id,
          status: ad.status,
          effective_status: ad.effective_status,
          created_time: ad.created_time,
          updated_time: ad.updated_time,
          creative_id: ad.creative?.id,
        })),
        count: response.data.length,
      };
    },
  });

/**
 * Get details of a specific ad
 */
export const createGetAdDetailsTool = (env: Env) =>
  createPrivateTool({
    id: "META_ADS_GET_AD_DETAILS",
    description:
      "Get detailed information about a specific Meta Ads ad including status, creative reference, and tracking configuration.",
    inputSchema: z.object({
      ad_id: z.string().describe("Meta Ads ad ID"),
    }),
    outputSchema: z.object({
      id: z.string(),
      name: z.string(),
      adset_id: z.string(),
      campaign_id: z.string(),
      status: z.string(),
      effective_status: z.string(),
      created_time: z.string(),
      updated_time: z.string(),
      creative_id: z.string().optional(),
      tracking_specs: z.array(z.record(z.string(), z.unknown())).optional(),
      conversion_specs: z.array(z.record(z.string(), z.unknown())).optional(),
    }),
    execute: async ({ context }) => {
      const accessToken = await getMetaAccessToken(env);
      const client = createMetaAdsClient({ accessToken });

      const ad = await client.getAdDetails(context.ad_id);

      return {
        id: ad.id,
        name: ad.name,
        adset_id: ad.adset_id,
        campaign_id: ad.campaign_id,
        status: ad.status,
        effective_status: ad.effective_status,
        created_time: ad.created_time,
        updated_time: ad.updated_time,
        creative_id: ad.creative?.id,
        tracking_specs: ad.tracking_specs,
        conversion_specs: ad.conversion_specs,
      };
    },
  });

/**
 * Get creative details for an ad
 */
export const createGetAdCreativesTool = (env: Env) =>
  createPrivateTool({
    id: "META_ADS_GET_AD_CREATIVES",
    description:
      "Get creative details for a specific Meta Ads ad including text, images, videos, and call-to-action configuration.",
    inputSchema: z.object({
      ad_id: z.string().describe("Meta Ads ad ID"),
    }),
    outputSchema: z.object({
      id: z.string(),
      name: z.string().optional(),
      title: z.string().optional(),
      body: z.string().optional(),
      call_to_action_type: z.string().optional(),
      image_url: z.string().optional(),
      image_hash: z.string().optional(),
      video_id: z.string().optional(),
      link_url: z.string().optional(),
      thumbnail_url: z.string().optional(),
      effective_object_story_id: z.string().optional(),
    }),
    execute: async ({ context }) => {
      const accessToken = await getMetaAccessToken(env);
      const client = createMetaAdsClient({ accessToken });

      const creative = await client.getAdCreatives(context.ad_id);

      return {
        id: creative.id,
        name: creative.name,
        title: creative.title,
        body: creative.body,
        call_to_action_type: creative.call_to_action_type,
        image_url: creative.image_url,
        image_hash: creative.image_hash,
        video_id: creative.video_id,
        link_url: creative.link_url,
        thumbnail_url: creative.thumbnail_url,
        effective_object_story_id: creative.effective_object_story_id,
      };
    },
  });

// Export all ad tools
export const adTools = [
  createGetAdsTool,
  createGetAdDetailsTool,
  createGetAdCreativesTool,
];
