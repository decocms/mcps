import { createTool, ensureAuthenticated } from "@decocms/runtime/tools";
import { z } from "zod";
import type { Env } from "../main.ts";
import { getAccessToken } from "../lib/env.ts";
import { AirtableClient } from "../lib/airtable-client.ts";

export const createWhoamiTool = (env: Env) =>
  createTool({
    id: "airtable_whoami",
    description:
      "Get the current authenticated user's ID, email, and OAuth scopes.",
    inputSchema: z.object({}),
    execute: async (_input, ctx) => {
      ensureAuthenticated(ctx!);
      const client = new AirtableClient(getAccessToken(env));
      return await client.whoami();
    },
  });
