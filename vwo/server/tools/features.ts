import { createPrivateTool } from "@decocms/runtime/tools";
import { z } from "zod";
import type { Env } from "../types/env.ts";
import { getAccountId, getApiToken } from "../lib/env.ts";
import { VWOClient } from "../lib/vwo-client.ts";

export const createListFeaturesTool = (env: Env) =>
  createPrivateTool({
    id: "vwo_list_features",
    description: "List all feature flags in the VWO account.",
    inputSchema: z.object({
      accountId: z
        .string()
        .optional()
        .describe("Account ID override. Uses default if not provided."),
    }),
    execute: async ({ context }) => {
      const client = new VWOClient(getApiToken(env));
      return await client.listFeatures(getAccountId(env, context.accountId));
    },
  });

export const createCreateFeatureTool = (env: Env) =>
  createPrivateTool({
    id: "vwo_create_feature",
    description: "Create a new feature flag with optional variables.",
    inputSchema: z.object({
      accountId: z
        .string()
        .optional()
        .describe("Account ID override. Uses default if not provided."),
      name: z.string().describe("Feature flag name"),
      featureKey: z.string().describe("Unique feature identifier/key"),
      description: z.string().optional().describe("Feature flag description"),
      featureType: z
        .string()
        .optional()
        .describe("Feature type: TEMPORARY (default) or PERMANENT"),
      goals: z
        .array(z.object({ metricId: z.number().describe("Metric ID") }))
        .min(1)
        .describe("At least one goal with a metric ID"),
      variables: z
        .array(
          z.object({
            variableName: z.string().describe("Variable name"),
            dataType: z
              .string()
              .describe("Data type: string, int, float, or json"),
            defaultValue: z.string().describe("Default value"),
          }),
        )
        .optional()
        .describe("Feature variables"),
    }),
    execute: async ({ context }) => {
      const client = new VWOClient(getApiToken(env));
      const { accountId: accountIdOverride, ...body } = context;
      return await client.createFeature(
        getAccountId(env, accountIdOverride),
        body,
      );
    },
  });

export const featureTools = [createListFeaturesTool, createCreateFeatureTool];
