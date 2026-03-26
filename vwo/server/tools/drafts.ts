import { createPrivateTool } from "@decocms/runtime/tools";
import { z } from "zod";
import type { Env } from "../types/env.ts";
import { getAccountId, getApiToken } from "../lib/env.ts";
import { VWOClient } from "../lib/vwo-client.ts";

export const createListDraftsTool = (env: Env) =>
  createPrivateTool({
    id: "vwo_list_drafts",
    description:
      "List all campaign drafts in the VWO account with their status and creation details.",
    inputSchema: z.object({
      accountId: z
        .string()
        .optional()
        .describe("Account ID override. Uses default if not provided."),
    }),
    execute: async ({ context }) => {
      const client = new VWOClient(getApiToken(env));
      return await client.listDrafts(getAccountId(env, context.accountId));
    },
  });

export const draftTools = [createListDraftsTool];
