import { createTool } from "@decocms/runtime/tools";
import { z } from "zod";
import { VTEXClient } from "../../lib/client.ts";
import type { Env } from "../../types/env.ts";

export const removeSkuFromCollection = (env: Env) =>
  createTool({
    id: "VTEX_REMOVE_SKU_FROM_COLLECTION",
    description: "Remove a single SKU from a collection.",
    inputSchema: z.object({
      collectionId: z.number().describe("The collection ID"),
      skuId: z.number().describe("The SKU ID to remove from the collection"),
    }),
    execute: async ({ context }) => {
      const { collectionId, skuId } = context;
      const credentials = env.MESH_REQUEST_CONTEXT.state;
      const client = new VTEXClient(credentials);
      await client.removeSkuFromCollection(collectionId, skuId);
      return {
        success: true,
        message: `SKU ${skuId} removed from collection ${collectionId}`,
      };
    },
  });

export const removeMultipleSkusFromCollection = (env: Env) =>
  createTool({
    id: "VTEX_REMOVE_MULTIPLE_SKUS_FROM_COLLECTION",
    description:
      "Remove multiple SKUs from a collection at once. This processes each SKU sequentially.",
    inputSchema: z.object({
      collectionId: z.number().describe("The collection ID"),
      skuIds: z
        .array(z.number())
        .describe("Array of SKU IDs to remove from the collection"),
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
          await client.removeSkuFromCollection(collectionId, skuId);
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
