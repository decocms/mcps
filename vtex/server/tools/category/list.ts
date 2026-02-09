import { createTool } from "@decocms/runtime/tools";
import { z } from "zod";
import { VTEXClient, getCredentials } from "../../lib/client.ts";
import type { Env } from "../../types/env.ts";

export const listCategories = (env: Env) =>
  createTool({
    id: "VTEX_LIST_CATEGORIES",
    description: "List the category tree up to specified levels deep.",
    inputSchema: z.object({
      levels: z
        .number()
        .optional()
        .describe("Levels of categories to return (default: 3)"),
    }),
    execute: async ({ context }) => {
      const client = new VTEXClient(getCredentials(env));
      return client.listCategories(context.levels);
    },
  });
