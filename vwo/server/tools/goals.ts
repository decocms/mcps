import { createPrivateTool } from "@decocms/runtime/tools";
import { z } from "zod";
import type { Env } from "../types/env.ts";
import { getAccountId, getApiToken } from "../lib/env.ts";
import { VWOClient } from "../lib/vwo-client.ts";

const urlSchema = z.object({
  type: z.string().describe("URL match type (e.g., 'url', 'pattern')"),
  value: z.string().describe("URL value or pattern"),
});

export const createListGoalsTool = (env: Env) =>
  createPrivateTool({
    id: "vwo_list_goals",
    description: "List all goals for a specific campaign.",
    inputSchema: z.object({
      accountId: z
        .string()
        .optional()
        .describe("Account ID override. Uses default if not provided."),
      campaignId: z.number().describe("Campaign ID"),
    }),
    execute: async ({ context }) => {
      const client = new VWOClient(getApiToken(env));
      return await client.listGoals(
        getAccountId(env, context.accountId),
        context.campaignId,
      );
    },
  });

export const createGetGoalTool = (env: Env) =>
  createPrivateTool({
    id: "vwo_get_goal",
    description: "Get details of a specific goal within a campaign.",
    inputSchema: z.object({
      accountId: z
        .string()
        .optional()
        .describe("Account ID override. Uses default if not provided."),
      campaignId: z.number().describe("Campaign ID"),
      goalId: z.number().describe("Goal ID"),
    }),
    execute: async ({ context }) => {
      const client = new VWOClient(getApiToken(env));
      return await client.getGoal(
        getAccountId(env, context.accountId),
        context.campaignId,
        context.goalId,
      );
    },
  });

export const createCreateGoalTool = (env: Env) =>
  createPrivateTool({
    id: "vwo_create_goal",
    description: "Create a new goal for a campaign.",
    inputSchema: z.object({
      accountId: z
        .string()
        .optional()
        .describe("Account ID override. Uses default if not provided."),
      campaignId: z.number().describe("Campaign ID"),
      name: z.string().describe("Goal name"),
      type: z
        .string()
        .describe(
          "Goal type: visitPage, engagement, formSubmit, clickLink, clickElement, revenue, custom-conversion",
        ),
      urls: z.array(urlSchema).optional().describe("URL patterns for the goal"),
      excludedUrls: z
        .array(urlSchema)
        .optional()
        .describe("URL patterns to exclude"),
      cssSelectors: z
        .array(z.string())
        .optional()
        .describe("CSS selectors for click/element goals"),
      isPrimary: z
        .boolean()
        .optional()
        .describe("Whether this is the primary goal"),
    }),
    execute: async ({ context }) => {
      const client = new VWOClient(getApiToken(env));
      const { accountId: accountIdOverride, campaignId, ...body } = context;
      return await client.createGoal(
        getAccountId(env, accountIdOverride),
        campaignId,
        body,
      );
    },
  });

export const createUpdateGoalTool = (env: Env) =>
  createPrivateTool({
    id: "vwo_update_goal",
    description: "Update an existing goal within a campaign.",
    inputSchema: z.object({
      accountId: z
        .string()
        .optional()
        .describe("Account ID override. Uses default if not provided."),
      campaignId: z.number().describe("Campaign ID"),
      goalId: z.number().describe("Goal ID to update"),
      name: z.string().optional().describe("Updated goal name"),
      type: z.string().optional().describe("Updated goal type"),
      urls: z.array(urlSchema).optional().describe("Updated URL patterns"),
      excludedUrls: z
        .array(urlSchema)
        .optional()
        .describe("Updated excluded URL patterns"),
      cssSelectors: z
        .array(z.string())
        .optional()
        .describe("Updated CSS selectors"),
      isPrimary: z
        .boolean()
        .optional()
        .describe("Whether this is the primary goal"),
    }),
    execute: async ({ context }) => {
      const client = new VWOClient(getApiToken(env));
      const {
        accountId: accountIdOverride,
        campaignId,
        goalId,
        ...body
      } = context;
      return await client.updateGoal(
        getAccountId(env, accountIdOverride),
        campaignId,
        goalId,
        body,
      );
    },
  });

export const goalTools = [
  createListGoalsTool,
  createGetGoalTool,
  createCreateGoalTool,
  createUpdateGoalTool,
];
