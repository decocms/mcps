/**
 * Ad Group Management Tools
 *
 * Tools for listing, creating, and updating ad groups
 */

import { createPrivateTool } from "@decocms/runtime/tools";
import { z } from "zod";
import type { Env } from "../main.ts";
import { TikTokClient, getAccessToken } from "../lib/tiktok-client.ts";

// ============================================================================
// Schema Definitions
// ============================================================================

const OperationStatusSchema = z.enum(["ENABLE", "DISABLE", "DELETE"]);

const BudgetModeSchema = z.enum([
  "BUDGET_MODE_INFINITE",
  "BUDGET_MODE_DAY",
  "BUDGET_MODE_TOTAL",
]);

const BidTypeSchema = z.enum(["BID_TYPE_NO_BID", "BID_TYPE_CUSTOM"]);

const OptimizationGoalSchema = z.enum([
  "CLICK",
  "CONVERT",
  "SHOW",
  "REACH",
  "VIDEO_VIEW",
  "LEAD_GENERATION",
  "ENGAGEMENT",
]);

const PlacementSchema = z.enum([
  "PLACEMENT_TIKTOK",
  "PLACEMENT_PANGLE",
  "PLACEMENT_GLOBAL_APP_BUNDLE",
]);

const ScheduleTypeSchema = z.enum(["SCHEDULE_START_END", "SCHEDULE_FROM_NOW"]);

const GenderSchema = z.enum([
  "GENDER_UNLIMITED",
  "GENDER_MALE",
  "GENDER_FEMALE",
]);

const AdGroupSchema = z.object({
  adgroup_id: z.string().describe("Ad Group ID"),
  adgroup_name: z.string().describe("Ad Group name"),
  advertiser_id: z.string().describe("Advertiser ID"),
  campaign_id: z.string().describe("Campaign ID"),
  operation_status: OperationStatusSchema.describe("Operation status"),
  secondary_status: z.string().describe("Secondary status"),
  placement_type: z.string().describe("Placement type"),
  placements: z.array(PlacementSchema).optional().describe("Placements"),
  optimization_goal: OptimizationGoalSchema.describe("Optimization goal"),
  bid_type: BidTypeSchema.describe("Bid type"),
  bid_price: z.number().optional().describe("Bid price"),
  budget_mode: BudgetModeSchema.describe("Budget mode"),
  budget: z.number().optional().describe("Budget amount"),
  schedule_type: ScheduleTypeSchema.describe("Schedule type"),
  schedule_start_time: z.string().optional().describe("Schedule start time"),
  schedule_end_time: z.string().optional().describe("Schedule end time"),
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
// List Ad Groups Tool
// ============================================================================

export const createListAdGroupsTool = (env: Env) =>
  createPrivateTool({
    id: "list_adgroups",
    description:
      "List all ad groups for an advertiser with optional filters for campaign, name, and status.",
    inputSchema: z.object({
      advertiser_id: z.string().describe("Advertiser ID (required)"),
      campaign_ids: z
        .array(z.string())
        .optional()
        .describe("Filter by campaign IDs"),
      adgroup_ids: z
        .array(z.string())
        .optional()
        .describe("Filter by specific ad group IDs"),
      adgroup_name: z
        .string()
        .optional()
        .describe("Filter by ad group name (partial match)"),
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
      adgroups: z.array(AdGroupSchema).describe("List of ad groups"),
      page_info: PageInfoSchema.describe("Pagination info"),
    }),
    execute: async ({ context }) => {
      const client = new TikTokClient({
        accessToken: getAccessToken(env),
      });

      const result = await client.listAdGroups({
        advertiser_id: context.advertiser_id,
        campaign_ids: context.campaign_ids,
        adgroup_ids: context.adgroup_ids,
        filtering: {
          adgroup_name: context.adgroup_name,
        },
        page: context.page,
        page_size: context.page_size,
      });

      return {
        adgroups: result.adgroups,
        page_info: result.page_info,
      };
    },
  });

// ============================================================================
// Get Ad Group Tool
// ============================================================================

export const createGetAdGroupTool = (env: Env) =>
  createPrivateTool({
    id: "get_adgroup",
    description:
      "Get detailed information about a specific ad group by its ID.",
    inputSchema: z.object({
      advertiser_id: z.string().describe("Advertiser ID (required)"),
      adgroup_id: z.string().describe("Ad Group ID to retrieve"),
    }),
    outputSchema: z.object({
      adgroup: AdGroupSchema.nullable().describe("Ad Group details"),
    }),
    execute: async ({ context }) => {
      const client = new TikTokClient({
        accessToken: getAccessToken(env),
      });

      const result = await client.listAdGroups({
        advertiser_id: context.advertiser_id,
        adgroup_ids: [context.adgroup_id],
      });

      return {
        adgroup: result.adgroups[0] || null,
      };
    },
  });

// ============================================================================
// Create Ad Group Tool
// ============================================================================

export const createCreateAdGroupTool = (env: Env) =>
  createPrivateTool({
    id: "create_adgroup",
    description:
      "Create a new ad group within a campaign. Requires advertiser ID, campaign ID, name, and optimization goal.",
    inputSchema: z.object({
      advertiser_id: z.string().describe("Advertiser ID (required)"),
      campaign_id: z.string().describe("Campaign ID (required)"),
      adgroup_name: z.string().describe("Ad Group name (required)"),
      optimization_goal: OptimizationGoalSchema.describe(
        "Optimization goal (required). Options: CLICK, CONVERT, SHOW, REACH, VIDEO_VIEW, LEAD_GENERATION, ENGAGEMENT",
      ),
      placements: z
        .array(PlacementSchema)
        .optional()
        .describe(
          "Placements: PLACEMENT_TIKTOK, PLACEMENT_PANGLE, PLACEMENT_GLOBAL_APP_BUNDLE",
        ),
      bid_type: BidTypeSchema.optional().describe(
        "Bid type: BID_TYPE_NO_BID or BID_TYPE_CUSTOM",
      ),
      bid_price: z.coerce
        .number()
        .positive()
        .optional()
        .describe("Bid price (required if bid_type is CUSTOM)"),
      budget_mode: BudgetModeSchema.optional().describe("Budget mode"),
      budget: z.coerce.number().positive().optional().describe("Budget amount"),
      schedule_type: ScheduleTypeSchema.optional().describe(
        "Schedule type: SCHEDULE_START_END or SCHEDULE_FROM_NOW",
      ),
      schedule_start_time: z
        .string()
        .optional()
        .describe("Start time (format: YYYY-MM-DD HH:mm:ss)"),
      schedule_end_time: z
        .string()
        .optional()
        .describe("End time (format: YYYY-MM-DD HH:mm:ss)"),
      location_ids: z
        .array(z.string())
        .optional()
        .describe("Target location IDs"),
      gender: GenderSchema.optional().describe("Target gender"),
      age_groups: z.array(z.string()).optional().describe("Target age groups"),
      languages: z.array(z.string()).optional().describe("Target languages"),
      operation_status: OperationStatusSchema.optional().describe(
        "Initial status: ENABLE or DISABLE",
      ),
    }),
    outputSchema: z.object({
      adgroup_id: z.string().describe("ID of the created ad group"),
      success: z.boolean().describe("Whether creation was successful"),
      message: z.string().describe("Result message"),
    }),
    execute: async ({ context }) => {
      const client = new TikTokClient({
        accessToken: getAccessToken(env),
      });

      const result = await client.createAdGroup({
        advertiser_id: context.advertiser_id,
        campaign_id: context.campaign_id,
        adgroup_name: context.adgroup_name,
        optimization_goal: context.optimization_goal,
        placements: context.placements,
        bid_type: context.bid_type,
        bid_price: context.bid_price,
        budget_mode: context.budget_mode,
        budget: context.budget,
        schedule_type: context.schedule_type,
        schedule_start_time: context.schedule_start_time,
        schedule_end_time: context.schedule_end_time,
        location_ids: context.location_ids,
        gender: context.gender,
        age_groups: context.age_groups,
        languages: context.languages,
        operation_status: context.operation_status,
      });

      return {
        adgroup_id: result.adgroup_id,
        success: true,
        message: `Ad Group "${context.adgroup_name}" created successfully`,
      };
    },
  });

// ============================================================================
// Update Ad Group Tool
// ============================================================================

export const createUpdateAdGroupTool = (env: Env) =>
  createPrivateTool({
    id: "update_adgroup",
    description:
      "Update an existing ad group. Only provided fields will be updated.",
    inputSchema: z.object({
      advertiser_id: z.string().describe("Advertiser ID (required)"),
      adgroup_id: z.string().describe("Ad Group ID to update (required)"),
      adgroup_name: z.string().optional().describe("New ad group name"),
      bid_price: z.coerce
        .number()
        .positive()
        .optional()
        .describe("New bid price"),
      budget: z.coerce
        .number()
        .positive()
        .optional()
        .describe("New budget amount"),
      schedule_end_time: z
        .string()
        .optional()
        .describe("New end time (format: YYYY-MM-DD HH:mm:ss)"),
      operation_status: OperationStatusSchema.optional().describe(
        "New status: ENABLE, DISABLE, or DELETE",
      ),
    }),
    outputSchema: z.object({
      adgroup_id: z.string().describe("ID of the updated ad group"),
      success: z.boolean().describe("Whether update was successful"),
      message: z.string().describe("Result message"),
    }),
    execute: async ({ context }) => {
      const client = new TikTokClient({
        accessToken: getAccessToken(env),
      });

      const result = await client.updateAdGroup({
        advertiser_id: context.advertiser_id,
        adgroup_id: context.adgroup_id,
        adgroup_name: context.adgroup_name,
        bid_price: context.bid_price,
        budget: context.budget,
        schedule_end_time: context.schedule_end_time,
        operation_status: context.operation_status,
      });

      return {
        adgroup_id: result.adgroup_id,
        success: true,
        message: `Ad Group ${context.adgroup_id} updated successfully`,
      };
    },
  });

// ============================================================================
// Export all ad group tools
// ============================================================================

export const adgroupTools = [
  createListAdGroupsTool,
  createGetAdGroupTool,
  createCreateAdGroupTool,
  createUpdateAdGroupTool,
];
