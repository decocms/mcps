import { createPrivateTool } from "@decocms/runtime/tools";
import { z } from "zod";
import type { Env } from "../types/env.ts";
import { getAccountId, getApiToken } from "../lib/env.ts";
import { VWOClient } from "../lib/vwo-client.ts";

export const createListUsersTool = (env: Env) =>
  createPrivateTool({
    id: "vwo_list_users",
    description:
      "List all users in the VWO account with their roles and emails.",
    inputSchema: z.object({
      accountId: z
        .string()
        .optional()
        .describe("Account ID override. Uses default if not provided."),
    }),
    execute: async ({ context }) => {
      const client = new VWOClient(getApiToken(env));
      return await client.listUsers(getAccountId(env, context.accountId));
    },
  });

export const userTools = [createListUsersTool];
