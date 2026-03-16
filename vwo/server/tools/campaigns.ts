import { createPrivateTool } from "@decocms/runtime/tools";
import { z } from "zod";
import type { Env } from "../types/env.ts";
import { getAccountId, getApiToken } from "../lib/env.ts";
import { VWOClient } from "../lib/vwo-client.ts";

export const createListCampaignsTool = (env: Env) =>
  createPrivateTool({
    id: "vwo_list_campaigns",
    description:
      "List all campaigns in the VWO account with optional filtering by type, platform, labels, and pagination.",
    inputSchema: z.object({
      accountId: z
        .string()
        .optional()
        .describe("Account ID override. Uses default if not provided."),
      limit: z
        .number()
        .optional()
        .describe("Number of campaigns to return (default: 25)"),
      offset: z.number().optional().describe("Pagination offset (default: 0)"),
      type: z
        .string()
        .optional()
        .describe(
          "Campaign type filter: ab, multivariate, split, targeting, heatmap, etc.",
        ),
      platform: z
        .string()
        .optional()
        .describe("Platform filter: website, full-stack, mobile-app"),
      label: z
        .string()
        .optional()
        .describe("Comma-separated list of labels to filter by"),
      showDetailedInfo: z
        .boolean()
        .optional()
        .describe(
          "Include segmentation, schedules, variations, and notes in response",
        ),
      projectId: z
        .number()
        .optional()
        .describe("Project ID filter (for FullStack campaigns)"),
      sdkKey: z
        .string()
        .optional()
        .describe("SDK key filter (for FullStack campaigns)"),
    }),
    execute: async ({ context }) => {
      const client = new VWOClient(getApiToken(env));
      const { accountId: accountIdOverride, ...params } = context;
      return await client.listCampaigns(
        getAccountId(env, accountIdOverride),
        params,
      );
    },
  });

export const createGetCampaignTool = (env: Env) =>
  createPrivateTool({
    id: "vwo_get_campaign",
    description:
      "Get detailed information about a specific campaign including variations, goals, schedules, and stats.",
    inputSchema: z.object({
      accountId: z
        .string()
        .optional()
        .describe("Account ID override. Uses default if not provided."),
      campaignId: z.number().describe("Campaign ID"),
    }),
    execute: async ({ context }) => {
      const client = new VWOClient(getApiToken(env));
      return await client.getCampaign(
        getAccountId(env, context.accountId),
        context.campaignId,
      );
    },
  });

export const createGetCampaignShareLinkTool = (env: Env) =>
  createPrivateTool({
    id: "vwo_get_campaign_share_link",
    description: "Get the share link for a specific campaign.",
    inputSchema: z.object({
      accountId: z
        .string()
        .optional()
        .describe("Account ID override. Uses default if not provided."),
      campaignId: z.number().describe("Campaign ID"),
    }),
    execute: async ({ context }) => {
      const client = new VWOClient(getApiToken(env));
      return await client.getCampaignShareLink(
        getAccountId(env, context.accountId),
        context.campaignId,
      );
    },
  });

export const createUpdateCampaignStatusTool = (env: Env) =>
  createPrivateTool({
    id: "vwo_update_campaign_status",
    description:
      "Update the status of one or more campaigns (RUNNING, STOPPED, PAUSED, TRASHED, RESTORED).",
    inputSchema: z.object({
      accountId: z
        .string()
        .optional()
        .describe("Account ID override. Uses default if not provided."),
      ids: z.array(z.number()).describe("Array of campaign IDs to update"),
      status: z
        .string()
        .describe("New status: RUNNING, STOPPED, PAUSED, TRASHED, or RESTORED"),
    }),
    execute: async ({ context }) => {
      const client = new VWOClient(getApiToken(env));
      return await client.updateCampaignStatus(
        getAccountId(env, context.accountId),
        { ids: context.ids, status: context.status },
      );
    },
  });

export const campaignTools = [
  createListCampaignsTool,
  createGetCampaignTool,
  createGetCampaignShareLinkTool,
  createUpdateCampaignStatusTool,
];
