import { createPrivateTool } from "@decocms/runtime/tools";
import { z } from "zod";
import type { Env } from "../types/env.ts";
import { getAccountId, getApiToken } from "../lib/env.ts";
import { VWOClient } from "../lib/vwo-client.ts";

export const createListVariationsTool = (env: Env) =>
  createPrivateTool({
    id: "vwo_list_variations",
    description:
      "List all variations of a campaign including control, split percentages, and editor data.",
    inputSchema: z.object({
      accountId: z
        .string()
        .optional()
        .describe("Account ID override. Uses default if not provided."),
      campaignId: z.number().describe("Campaign ID"),
    }),
    execute: async ({ context }) => {
      const client = new VWOClient(getApiToken(env));
      return await client.listVariations(
        getAccountId(env, context.accountId),
        context.campaignId,
      );
    },
  });

export const variationTools = [createListVariationsTool];
