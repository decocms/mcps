import { createPrivateTool } from "@decocms/runtime/tools";
import { z } from "zod";
import type { Env } from "../types/env.ts";
import { getAccountId, getApiToken } from "../lib/env.ts";
import { VWOClient } from "../lib/vwo-client.ts";

export const createListFeatureRulesTool = (env: Env) =>
  createPrivateTool({
    id: "vwo_list_feature_rules",
    description: "List all rules for a feature flag in a specific environment.",
    inputSchema: z.object({
      accountId: z
        .string()
        .optional()
        .describe("Account ID override. Uses default if not provided."),
      environmentId: z
        .union([z.string(), z.number()])
        .describe("Environment ID or key"),
      featureId: z
        .union([z.string(), z.number()])
        .describe("Feature flag ID or key"),
      limit: z
        .number()
        .optional()
        .describe("Number of rules to return (default: 10)"),
      offset: z.number().optional().describe("Pagination offset (default: 0)"),
    }),
    execute: async ({ context }) => {
      const client = new VWOClient(getApiToken(env));
      return await client.listFeatureRules(
        getAccountId(env, context.accountId),
        context.environmentId,
        context.featureId,
        { limit: context.limit, offset: context.offset },
      );
    },
  });

export const createCreateFeatureRuleTool = (env: Env) =>
  createPrivateTool({
    id: "vwo_create_feature_rule",
    description: "Create a new rule for a feature flag in an environment.",
    inputSchema: z.object({
      accountId: z
        .string()
        .optional()
        .describe("Account ID override. Uses default if not provided."),
      environmentId: z
        .union([z.string(), z.number()])
        .describe("Environment ID or key"),
      featureId: z
        .union([z.string(), z.number()])
        .describe("Feature flag ID or key"),
      name: z.string().describe("Rule name"),
      key: z.string().describe("Unique rule identifier"),
      type: z
        .string()
        .optional()
        .describe(
          "Rule type: FLAG_ROLLOUT (default), FLAG_PERSONALIZE, FLAG_TESTING, FLAG_MULTIVARIATE",
        ),
      campaignData: z
        .object({
          percentSplit: z
            .number()
            .optional()
            .describe("Traffic percentage (default: 100)"),
          variations: z
            .array(
              z.object({
                featureVariationId: z.number().describe("Variation ID"),
              }),
            )
            .optional()
            .describe("Variations to include in the rule"),
        })
        .optional()
        .describe("Campaign configuration for the rule"),
    }),
    execute: async ({ context }) => {
      const client = new VWOClient(getApiToken(env));
      const {
        accountId: accountIdOverride,
        environmentId,
        featureId,
        ...body
      } = context;
      return await client.createFeatureRule(
        getAccountId(env, accountIdOverride),
        environmentId,
        featureId,
        body,
      );
    },
  });

export const featureRuleTools = [
  createListFeatureRulesTool,
  createCreateFeatureRuleTool,
];
