/**
 * Ad-related tools for Meta Ads
 *
 * Tools:
 * - META_ADS_GET_ADS: List ads with optional filtering by campaign/adset
 * - META_ADS_GET_AD_DETAILS: Get detailed info about a specific ad
 * - META_ADS_GET_AD_CREATIVES: Get creative details for an ad
 * - META_ADS_CREATE_AD: Create a new ad
 * - META_ADS_UPDATE_AD: Update an existing ad
 * - META_ADS_DELETE_AD: Delete an ad
 * - META_ADS_CREATE_AD_CREATIVE: Create a new ad creative
 */

import { createPrivateTool } from "@decocms/runtime/tools";
import { z } from "zod";
import type { Env } from "../main.ts";
import { getMetaAccessToken } from "../main.ts";
import { createMetaAdsClient } from "../lib/meta-client.ts";
import type { AdStatus, UpdateAdParams } from "../lib/types.ts";

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
        .default(50)
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

/**
 * Create a new ad
 */
export const createCreateAdTool = (env: Env) =>
  createPrivateTool({
    id: "META_ADS_CREATE_AD",
    description:
      "Create a new Meta Ads ad. This is STEP 4 (final step) to create ads. REQUIRES: adset_id from CREATE_ADSET AND creative_id from CREATE_AD_CREATIVE. FLOW: 1) CREATE_CAMPAIGN → 2) CREATE_ADSET → 3) CREATE_AD_CREATIVE → 4) CREATE_AD. If you don't have these IDs, go back and create them first.",
    inputSchema: z.object({
      account_id: z
        .string()
        .describe("Meta Ads account ID (format: act_XXXXXXXXX)"),
      adset_id: z.string().describe("Ad set ID to create the ad in"),
      name: z.string().describe("Ad name"),
      creative_id: z
        .string()
        .describe(
          "Creative ID to use for this ad (created via META_ADS_CREATE_AD_CREATIVE)",
        ),
      status: z
        .enum(["ACTIVE", "PAUSED"])
        .optional()
        .default("PAUSED")
        .describe("Ad status (default: PAUSED)"),
      conversion_domain: z
        .string()
        .optional()
        .describe("Domain for conversion tracking (e.g., 'example.com')"),
    }),
    outputSchema: z.object({
      id: z.string().describe("ID of the created ad"),
      success: z.boolean().describe("Whether the ad was created successfully"),
    }),
    execute: async ({ context }) => {
      const accessToken = await getMetaAccessToken(env);
      const client = createMetaAdsClient({ accessToken });

      const response = await client.createAd(context.account_id, {
        adset_id: context.adset_id,
        name: context.name,
        status: context.status,
        creative: {
          creative_id: context.creative_id,
        },
        conversion_domain: context.conversion_domain,
      });

      return {
        id: response.id || "",
        success: !!response.id,
      };
    },
  });

/**
 * Update an existing ad
 */
export const createUpdateAdTool = (env: Env) =>
  createPrivateTool({
    id: "META_ADS_UPDATE_AD",
    description:
      "Update an existing Meta Ads ad. Can change name, status, or creative.",
    inputSchema: z.object({
      ad_id: z.string().describe("Ad ID to update"),
      name: z.string().optional().describe("New ad name"),
      status: z
        .enum(["ACTIVE", "PAUSED", "DELETED", "ARCHIVED"])
        .optional()
        .describe("New status. Use PAUSED to pause, ACTIVE to activate."),
      creative_id: z.string().optional().describe("New creative ID to use"),
    }),
    outputSchema: z.object({
      success: z.boolean().describe("Whether the update was successful"),
    }),
    execute: async ({ context }) => {
      const accessToken = await getMetaAccessToken(env);
      const client = createMetaAdsClient({ accessToken });

      const params: UpdateAdParams = {};
      if (context.name !== undefined) params.name = context.name;
      if (context.status !== undefined)
        params.status = context.status as AdStatus;
      if (context.creative_id !== undefined) {
        params.creative = { creative_id: context.creative_id };
      }

      const response = await client.updateAd(context.ad_id as string, params);

      return {
        success: response.success ?? true,
      };
    },
  });

/**
 * Delete an ad
 */
export const createDeleteAdTool = (env: Env) =>
  createPrivateTool({
    id: "META_ADS_DELETE_AD",
    description: "Delete a Meta Ads ad. This action cannot be undone.",
    inputSchema: z.object({
      ad_id: z.string().describe("Ad ID to delete"),
    }),
    outputSchema: z.object({
      success: z.boolean().describe("Whether the deletion was successful"),
    }),
    execute: async ({ context }) => {
      const accessToken = await getMetaAccessToken(env);
      const client = createMetaAdsClient({ accessToken });

      const response = await client.deleteAd(context.ad_id);

      return {
        success: response.success,
      };
    },
  });

// Call to action types schema
const callToActionTypeSchema = z.enum([
  "APPLY_NOW",
  "BOOK_TRAVEL",
  "BUY_NOW",
  "BUY_TICKETS",
  "CALL",
  "CONTACT_US",
  "DONATE",
  "DONATE_NOW",
  "DOWNLOAD",
  "GET_DIRECTIONS",
  "GET_OFFER",
  "GET_QUOTE",
  "GET_SHOWTIMES",
  "INSTALL_APP",
  "LEARN_MORE",
  "LISTEN_NOW",
  "MESSAGE_PAGE",
  "NO_BUTTON",
  "OPEN_LINK",
  "ORDER_NOW",
  "PLAY_GAME",
  "SHOP_NOW",
  "SIGN_UP",
  "SUBSCRIBE",
  "USE_APP",
  "WATCH_MORE",
  "WATCH_VIDEO",
  "WHATSAPP_MESSAGE",
]);

/**
 * Create an ad creative
 */
export const createCreateAdCreativeTool = (env: Env) =>
  createPrivateTool({
    id: "META_ADS_CREATE_AD_CREATIVE",
    description:
      "Create an ad creative with text and CTA. This is STEP 3 in the ad creation flow. REQUIRES: page_id (Facebook Page) and link URL, OR use effective_object_story_id to promote an existing Facebook/Instagram post. FLOW: 1) CREATE_CAMPAIGN → 2) CREATE_ADSET → 3) CREATE_AD_CREATIVE → 4) CREATE_AD. Returns creative_id to use in CREATE_AD.",
    inputSchema: z.object({
      account_id: z
        .string()
        .describe("Meta Ads account ID (format: act_XXXXXXXXX)"),
      name: z
        .string()
        .optional()
        .describe("Creative name for internal reference"),
      // Option 1: Use object_story_spec for new creatives
      page_id: z
        .string()
        .optional()
        .describe(
          "Facebook Page ID associated with the ad (required for most ad types)",
        ),
      link: z
        .string()
        .optional()
        .describe("Destination URL when users click the ad"),
      message: z
        .string()
        .optional()
        .describe("Primary text that appears above the image/video"),
      headline: z
        .string()
        .optional()
        .describe("Headline text that appears below the image"),
      description: z
        .string()
        .optional()
        .describe("Description text (appears below headline)"),
      video_id: z
        .string()
        .optional()
        .describe("Video ID if using video creative"),
      call_to_action_type: callToActionTypeSchema
        .optional()
        .describe(
          "Call to action button type (e.g., LEARN_MORE, SHOP_NOW, SIGN_UP)",
        ),
      // Option 2: Use existing post
      effective_object_story_id: z
        .string()
        .optional()
        .describe(
          "Use an existing Facebook/Instagram post as the creative. Format: page_id_post_id",
        ),
      // Option 3: Instagram media
      source_instagram_media_id: z
        .string()
        .optional()
        .describe("Instagram post ID to use as creative"),
      // Additional options
      url_tags: z
        .string()
        .optional()
        .describe(
          "URL parameters to append to all links (e.g., 'utm_source=facebook&utm_medium=ad')",
        ),
    }),
    outputSchema: z.object({
      id: z.string().describe("ID of the created creative"),
      success: z
        .boolean()
        .describe("Whether the creative was created successfully"),
    }),
    execute: async ({ context }) => {
      const accessToken = await getMetaAccessToken(env);
      const client = createMetaAdsClient({ accessToken });

      // Build the creative params
      const params: Record<string, unknown> = {};

      if (context.name) {
        params.name = context.name;
      }

      // If using existing post
      if (context.effective_object_story_id) {
        params.effective_object_story_id = context.effective_object_story_id;
      } else if (context.source_instagram_media_id) {
        params.source_instagram_media_id = context.source_instagram_media_id;
      } else if (context.page_id && context.link) {
        // Build object_story_spec for new creative
        const linkData: Record<string, unknown> = {
          link: context.link,
        };

        if (context.message) {
          linkData.message = context.message;
        }
        if (context.headline) {
          linkData.name = context.headline;
        }
        if (context.description) {
          linkData.description = context.description;
        }
        if (context.video_id) {
          linkData.video_id = context.video_id;
        }
        if (context.call_to_action_type) {
          linkData.call_to_action = {
            type: context.call_to_action_type,
            value: {
              link: context.link,
            },
          };
        }

        params.object_story_spec = {
          page_id: context.page_id,
          link_data: linkData,
        };
      }

      if (context.url_tags) {
        params.url_tags = context.url_tags;
      }

      const response = await client.createAdCreative(
        context.account_id,
        params,
      );

      return {
        id: response.id || "",
        success: !!response.id,
      };
    },
  });

// Export all ad tools
export const adTools = [
  createGetAdsTool,
  createGetAdDetailsTool,
  createGetAdCreativesTool,
  createCreateAdTool,
  createUpdateAdTool,
  createDeleteAdTool,
  createCreateAdCreativeTool,
];
