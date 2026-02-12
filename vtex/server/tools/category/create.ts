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

export const createCategory = (env: Env) =>
  createTool({
    id: "VTEX_CREATE_CATEGORY",
    description: "Create a new category.",
    inputSchema: z.object({
      Name: z.string().describe("Category name"),
      FatherCategoryId: z
        .union([z.coerce.number(), z.null()])
        .optional()
        .describe("Parent category ID (null for root)"),
      Title: z.string().optional().describe("Category title for SEO"),
      Description: z.string().optional().describe("Category description"),
      Keywords: z.string().optional().describe("Keywords for search"),
      IsActive: z.boolean().optional().describe("Whether category is active"),
      ShowInStoreFront: z.boolean().optional().describe("Show in store"),
    }),
    outputSchema,
    execute: async ({ context }) => {
      const credentials = env.MESH_REQUEST_CONTEXT.state;
      const client = new VTEXClient(credentials);
      const result = await client.createCategory(context);
      return outputSchema.parse(result);
    },
  });
