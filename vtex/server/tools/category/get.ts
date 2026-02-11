import { createTool } from "@decocms/runtime/tools";
import { z } from "zod";
import { VTEXClient } from "../../lib/client.ts";
import type { Env } from "../../types/env.ts";

export const getCategory = (env: Env) =>
  createTool({
    id: "VTEX_GET_CATEGORY",
    description: "Get category details by ID.",
    inputSchema: z.object({
      categoryId: z.number().describe("The category ID"),
    }),
    execute: async ({ context }) => {
      const credentials = env.DECO_CHAT_REQUEST_CONTEXT.state;
      const client = new VTEXClient(credentials);
      return client.getCategory(context.categoryId);
    },
  });
