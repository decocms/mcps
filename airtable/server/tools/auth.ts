import { createPrivateTool } from "@decocms/runtime/tools";
import { z } from "zod";
import type { Env } from "../main.ts";
import { getAccessToken } from "../lib/env.ts";
import { AirtableClient } from "../lib/airtable-client.ts";

export const createWhoamiTool = (env: Env) =>
  createPrivateTool({
    id: "airtable_whoami",
    description:
      "Get the current authenticated user's ID, email, and OAuth scopes.",
    inputSchema: z.object({}),
    execute: async () => {
      const client = new AirtableClient(getAccessToken(env));
      return await client.whoami();
    },
  });
