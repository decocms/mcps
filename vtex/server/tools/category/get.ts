import { createTool } from "@decocms/runtime/tools";
import { z } from "zod";
import { VTEXClient } from "../../lib/client.ts";
import type { Env } from "../../types/env.ts";

const outputSchema = z.object({
  Id: z.number(),
  Name: z.string(),
  FatherCategoryId: z.number().nullable(),
  Title: z.string(),
  Description: z.string(),
  Keywords: z.string(),
  IsActive: z.boolean(),
  ShowInStoreFront: z.boolean(),
  ShowBrandFilter: z.boolean(),
  ActiveStoreFrontLink: z.boolean(),
  GlobalCategoryId: z.number(),
  Score: z.number().nullable(),
  LinkId: z.string(),
  HasChildren: z.boolean(),
});

export const getCategory = (env: Env) =>
  createTool({
    id: "VTEX_GET_CATEGORY",
    description: "Get category details by ID.",
    inputSchema: z.object({
      categoryId: z.coerce.number().describe("The category ID"),
    }),
    outputSchema,
    execute: async ({ context }) => {
      const credentials = env.MESH_REQUEST_CONTEXT.state;
      const client = new VTEXClient(credentials);
      const result = await client.getCategory(context.categoryId);
      return outputSchema.parse(result);
    },
  });
