import { createTool } from "@decocms/runtime/tools";
import { z } from "zod";
import { VTEXClient } from "../../lib/client.ts";
import type { Env } from "../../types/env.ts";

const outputSchema = z.object({
  Data: z.array(
    z.object({
      ProductId: z.number(),
      SkuId: z.number(),
      Position: z.number(),
      ProductName: z.string(),
      SkuImageUrl: z.string().nullable(),
    }),
  ),
  Page: z.number(),
  Size: z.number(),
  TotalRows: z.number(),
  TotalPage: z.number(),
});

export const getCollectionProducts = (env: Env) =>
  createTool({
    id: "VTEX_GET_COLLECTION_PRODUCTS",
    description: "Get all products/SKUs from a specific collection.",
    inputSchema: z.object({
      collectionId: z.coerce.number().describe("The collection ID"),
      page: z.coerce.number().optional().describe("Page number"),
      pageSize: z.coerce
        .number()
        .optional()
        .describe("Number of items per page"),
    }),
    outputSchema,
    execute: async ({ context }) => {
      const { collectionId, ...params } = context;
      const credentials = env.MESH_REQUEST_CONTEXT.state;
      const client = new VTEXClient(credentials);
      const result = await client.getCollectionProducts(collectionId, params);
      return outputSchema.parse(result);
    },
  });
