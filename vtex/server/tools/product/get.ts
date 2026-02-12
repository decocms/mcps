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

export const getProduct = (env: Env) =>
  createTool({
    id: "VTEX_GET_PRODUCT",
    description:
      "Get a product by its ID. Returns product details including name, description, category, brand, and status.",
    inputSchema: z.object({
      productId: z.coerce.number().describe("The product ID"),
    }),
    outputSchema,
    execute: async ({ context }) => {
      const credentials = env.MESH_REQUEST_CONTEXT.state;
      const client = new VTEXClient(credentials);
      const result = await client.getProduct(context.productId);
      return outputSchema.parse(result);
    },
  });
