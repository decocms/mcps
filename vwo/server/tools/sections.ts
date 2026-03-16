import { createPrivateTool } from "@decocms/runtime/tools";
import { z } from "zod";
import type { Env } from "../types/env.ts";
import { getAccountId, getApiToken } from "../lib/env.ts";
import { VWOClient } from "../lib/vwo-client.ts";

export const createListSectionsTool = (env: Env) =>
  createPrivateTool({
    id: "vwo_list_sections",
    description:
      "List all sections of a campaign with their CSS selectors and variation details.",
    inputSchema: z.object({
      accountId: z
        .string()
        .optional()
        .describe("Account ID override. Uses default if not provided."),
      campaignId: z.number().describe("Campaign ID"),
    }),
    execute: async ({ context }) => {
      const client = new VWOClient(getApiToken(env));
      return await client.listSections(
        getAccountId(env, context.accountId),
        context.campaignId,
      );
    },
  });

export const sectionTools = [createListSectionsTool];
