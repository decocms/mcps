import { createTool } from "@decocms/runtime/tools";
import { z } from "zod";
import { VTEXClient } from "../../lib/client.ts";
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
      const credentials = env.MESH_REQUEST_CONTEXT.state;
      const client = new VTEXClient(credentials);
      const categories = await client.listCategories(context.levels);
      return { categories };
    },
  });
