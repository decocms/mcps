/**
 * Campaign Management Tools
 *
 * Tools for listing, creating, and updating campaigns
 */

import { createPrivateTool } from "@decocms/runtime/tools";
import { z } from "zod";
import type { Env } from "../main.ts";
import { TikTokClient, getAccessToken } from "../lib/tiktok-client.ts";

// ============================================================================
// Schema Definitions
// ============================================================================

const CampaignObjectiveSchema = z.enum([
  "TRAFFIC",
  "APP_PROMOTION",
  "WEB_CONVERSIONS",
  "PRODUCT_SALES",
  "REACH",
  "VIDEO_VIEWS",
  "LEAD_GENERATION",
  "COMMUNITY_INTERACTION",
]);

const BudgetModeSchema = z.enum([
  "BUDGET_MODE_INFINITE",
  "BUDGET_MODE_DAY",
  "BUDGET_MODE_TOTAL",
]);

const OperationStatusSchema = z.enum(["ENABLE", "DISABLE", "DELETE"]);

const CampaignSchema = z.object({
  campaign_id: z.string().describe("Campaign ID"),
  campaign_name: z.string().describe("Campaign name"),
  advertiser_id: z.string().describe("Advertiser ID"),
  objective_type: CampaignObjectiveSchema.describe("Campaign objective"),
  operation_status: OperationStatusSchema.describe("Operation status"),
  secondary_status: z.string().describe("Secondary status"),
  budget_mode: BudgetModeSchema.describe("Budget mode"),
  budget: z.number().optional().describe("Budget amount"),
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
// List Campaigns Tool
// ============================================================================

export const createListCampaignsTool = (env: Env) =>
  createPrivateTool({
    id: "list_campaigns",
    description:
      "List all campaigns for an advertiser with optional filters for name, objective, and status.",
    inputSchema: z.object({
      advertiser_id: z.string().describe("Advertiser ID (required)"),
      campaign_ids: z
        .array(z.string())
        .optional()
        .describe("Filter by specific campaign IDs"),
      campaign_name: z
        .string()
        .optional()
        .describe("Filter by campaign name (partial match)"),
      objective_type: CampaignObjectiveSchema.optional().describe(
        "Filter by objective type",
      ),
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
      campaigns: z.array(CampaignSchema).describe("List of campaigns"),
      page_info: PageInfoSchema.describe("Pagination info"),
    }),
    execute: async ({ context }) => {
      const client = new TikTokClient({
        accessToken: getAccessToken(env),
      });

      const result = await client.listCampaigns({
        advertiser_id: context.advertiser_id,
        campaign_ids: context.campaign_ids,
        filtering: {
          campaign_name: context.campaign_name,
          objective_type: context.objective_type,
        },
        page: context.page,
        page_size: context.page_size,
      });

      return {
        campaigns: result.campaigns,
        page_info: result.page_info,
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
      "Get detailed information about a specific campaign by its ID.",
    inputSchema: z.object({
      advertiser_id: z.string().describe("Advertiser ID (required)"),
      campaign_id: z.string().describe("Campaign ID to retrieve"),
    }),
    outputSchema: z.object({
      campaign: CampaignSchema.nullable().describe("Campaign details"),
    }),
    execute: async ({ context }) => {
      const client = new TikTokClient({
        accessToken: getAccessToken(env),
      });

      const result = await client.listCampaigns({
        advertiser_id: context.advertiser_id,
        campaign_ids: [context.campaign_id],
      });

      return {
        campaign: result.campaigns[0] || null,
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
      "Create a new advertising campaign. Requires advertiser ID, name, and objective type.",
    inputSchema: z.object({
      advertiser_id: z.string().describe("Advertiser ID (required)"),
      campaign_name: z.string().describe("Campaign name (required)"),
      objective_type: CampaignObjectiveSchema.describe(
        "Campaign objective (required). Options: TRAFFIC, APP_PROMOTION, WEB_CONVERSIONS, PRODUCT_SALES, REACH, VIDEO_VIEWS, LEAD_GENERATION, COMMUNITY_INTERACTION",
      ),
      budget_mode: BudgetModeSchema.optional().describe(
        "Budget mode: BUDGET_MODE_INFINITE (no limit), BUDGET_MODE_DAY (daily), BUDGET_MODE_TOTAL (lifetime)",
      ),
      budget: z.coerce
        .number()
        .positive()
        .optional()
        .describe("Budget amount (required if budget_mode is DAY or TOTAL)"),
      operation_status: OperationStatusSchema.optional().describe(
        "Initial status: ENABLE or DISABLE (default: ENABLE)",
      ),
    }),
    outputSchema: z.object({
      campaign_id: z.string().describe("ID of the created campaign"),
      success: z.boolean().describe("Whether creation was successful"),
      message: z.string().describe("Result message"),
    }),
    execute: async ({ context }) => {
      const client = new TikTokClient({
        accessToken: getAccessToken(env),
      });

      const result = await client.createCampaign({
        advertiser_id: context.advertiser_id,
        campaign_name: context.campaign_name,
        objective_type: context.objective_type,
        budget_mode: context.budget_mode,
        budget: context.budget,
        operation_status: context.operation_status,
      });

      return {
        campaign_id: result.campaign_id,
        success: true,
        message: `Campaign "${context.campaign_name}" created successfully`,
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
      "Update an existing campaign. Only provided fields will be updated. At least one field to update must be provided.",
    inputSchema: z
      .object({
        advertiser_id: z.string().describe("Advertiser ID (required)"),
        campaign_id: z.string().describe("Campaign ID to update (required)"),
        campaign_name: z.string().optional().describe("New campaign name"),
        budget_mode: BudgetModeSchema.optional().describe("New budget mode"),
        budget: z.coerce
          .number()
          .positive()
          .optional()
          .describe("New budget amount"),
        operation_status: OperationStatusSchema.optional().describe(
          "New status: ENABLE, DISABLE, or DELETE",
        ),
      })
      .refine(
        (data) =>
          data.campaign_name !== undefined ||
          data.budget_mode !== undefined ||
          data.budget !== undefined ||
          data.operation_status !== undefined,
        {
          message:
            "At least one field to update must be provided (campaign_name, budget_mode, budget, or operation_status)",
        },
      ),
    outputSchema: z.object({
      campaign_id: z.string().describe("ID of the updated campaign"),
      success: z.boolean().describe("Whether update was successful"),
      message: z.string().describe("Result message"),
    }),
    execute: async ({ context }) => {
      const client = new TikTokClient({
        accessToken: getAccessToken(env),
      });

      const result = await client.updateCampaign({
        advertiser_id: context.advertiser_id,
        campaign_id: context.campaign_id,
        campaign_name: context.campaign_name,
        budget_mode: context.budget_mode,
        budget: context.budget,
        operation_status: context.operation_status,
      });

      return {
        campaign_id: result.campaign_id,
        success: true,
        message: `Campaign ${context.campaign_id} updated successfully`,
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
];
