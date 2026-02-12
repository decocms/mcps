import { createTool } from "@decocms/runtime/tools";
import { z } from "zod";
import { VTEXClient } from "../../lib/client.ts";
import type { Env } from "../../types/env.ts";

const outputSchema = z.object({
  Id: z.number(),
  Name: z.string(),
  DepartmentId: z.number(),
  CategoryId: z.number(),
  BrandId: z.number(),
  LinkId: z.string(),
  RefId: z.string(),
  IsVisible: z.boolean(),
  Description: z.string(),
  DescriptionShort: z.string(),
  ReleaseDate: z.string(),
  KeyWords: z.string(),
  Title: z.string(),
  IsActive: z.boolean(),
  TaxCode: z.string(),
  MetaTagDescription: z.string(),
  ShowWithoutStock: z.boolean(),
  Score: z.number().nullable(),
});

export const updateProduct = (env: Env) =>
  createTool({
    id: "VTEX_UPDATE_PRODUCT",
    description: "Update an existing product.",
    inputSchema: z.object({
      productId: z.coerce.number().describe("Product ID to update"),
      Name: z.string().optional().describe("Product name"),
      CategoryId: z.coerce.number().optional().describe("Category ID"),
      BrandId: z.coerce.number().optional().describe("Brand ID"),
      LinkId: z.string().optional().describe("URL slug"),
      Description: z.string().optional().describe("Product description"),
      IsActive: z.coerce
        .boolean()
        .optional()
        .describe("Whether product is active"),
    }),
    outputSchema,
    execute: async ({ context }) => {
      const { productId, ...data } = context;
      const credentials = env.MESH_REQUEST_CONTEXT.state;
      const client = new VTEXClient(credentials);
      const result = await client.updateProduct(productId, data);
      return outputSchema.parse(result);
    },
  });
