import { createTool } from "@decocms/runtime/tools";
import { z } from "zod";
import { VTEXClient } from "../../lib/client.ts";
import type { Env } from "../../types/env.ts";

const addSkuOutputSchema = z.object({
  SkuId: z.number(),
  ProductId: z.number(),
});

export const addSkuToCollection = (env: Env) =>
  createTool({
    id: "VTEX_ADD_SKU_TO_COLLECTION",
    description:
      "Add a single SKU to a collection. Use this to manually add products one by one.",
    inputSchema: z.object({
      collectionId: z.coerce.number().describe("The collection ID"),
      skuId: z.coerce.number().describe("The SKU ID to add to the collection"),
    }),
    outputSchema: addSkuOutputSchema,
    execute: async ({ context }) => {
      const { collectionId, skuId } = context;
      const credentials = env.MESH_REQUEST_CONTEXT.state;
      const client = new VTEXClient(credentials);
      const result = await client.addSkuToCollection(collectionId, {
        SkuId: skuId,
      });
      return addSkuOutputSchema.parse(result);
    },
  });

export const addMultipleSkusToCollection = (env: Env) =>
  createTool({
    id: "VTEX_ADD_MULTIPLE_SKUS_TO_COLLECTION",
    description:
      "Add multiple SKUs to a collection at once. This processes each SKU sequentially.",
    inputSchema: z.object({
      collectionId: z.coerce.number().describe("The collection ID"),
      skuIds: z
        .array(z.coerce.number())
        .describe("Array of SKU IDs to add to the collection"),
    }),
    execute: async ({ context }) => {
      const { collectionId, skuIds } = context;
      const credentials = env.MESH_REQUEST_CONTEXT.state;
      const client = new VTEXClient(credentials);

      const results = {
        success: [] as number[],
        failed: [] as { skuId: number; error: string }[],
      };

      for (const skuId of skuIds) {
        try {
          await client.addSkuToCollection(collectionId, { SkuId: skuId });
          results.success.push(skuId);
        } catch (error) {
          results.failed.push({
            skuId,
            error: error instanceof Error ? error.message : "Unknown error",
          });
        }
      }

      return {
        totalProcessed: skuIds.length,
        successCount: results.success.length,
        failedCount: results.failed.length,
        ...results,
      };
    },
  });
