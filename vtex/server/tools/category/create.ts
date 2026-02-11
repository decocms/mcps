import { createTool } from "@decocms/runtime/tools";
import { z } from "zod";
import { VTEXClient } from "../../lib/client.ts";
import type { Env } from "../../types/env.ts";

export const createCategory = (env: Env) =>
  createTool({
    id: "VTEX_CREATE_CATEGORY",
    description: "Create a new category.",
    inputSchema: z.object({
      Name: z.string().describe("Category name"),
      FatherCategoryId: z
        .number()
        .nullable()
        .optional()
        .describe("Parent category ID (null for root)"),
      Title: z.string().optional().describe("Category title for SEO"),
      Description: z.string().optional().describe("Category description"),
      Keywords: z.string().optional().describe("Keywords for search"),
      IsActive: z.boolean().optional().describe("Whether category is active"),
      ShowInStoreFront: z.boolean().optional().describe("Show in store"),
    }),
    execute: async ({ context }) => {
      const credentials = env.MESH_REQUEST_CONTEXT.state;
      const client = new VTEXClient(credentials);
      return client.createCategory(context);
    },
  });
