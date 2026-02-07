import { createTool } from "@decocms/runtime/tools";
import { z } from "zod";
import { VTEXClient, getCredentials } from "../../lib/client.ts";
import type { Env } from "../../types/env.ts";

export const getCategory = (env: Env) =>
  createTool({
    id: "VTEX_GET_CATEGORY",
    description: "Get category details by ID.",
    inputSchema: z.object({
      categoryId: z.number().describe("The category ID"),
    }),
    execute: async ({ context }) => {
      const client = new VTEXClient(getCredentials(env));
      return client.getCategory(context.categoryId);
    },
  });
