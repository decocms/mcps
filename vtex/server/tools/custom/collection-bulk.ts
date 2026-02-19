/* eslint-disable @typescript-eslint/no-explicit-any */
import { createTool } from "@decocms/runtime/tools";
import { z } from "zod";
import * as catalogSdk from "../../generated/catalog/sdk.gen.ts";
import type { Env } from "../../types/env.ts";
import { createVtexClient } from "../../lib/client-factory.ts";

export const addMultipleSkusToCollection = (env: Env) =>
  createTool({
    id: "VTEX_ADD_MULTIPLE_SKUS_TO_COLLECTION",
    description:
      "Add multiple SKUs to a subcollection at once. This processes each SKU sequentially.",
    inputSchema: z.object({
      collectionId: z.coerce.number().describe("The subcollection ID"),
      skuIds: z
        .array(z.coerce.number())
        .describe("Array of SKU IDs to add to the subcollection"),
    }),
    execute: async ({ context }) => {
      const { collectionId, skuIds } = context;
      const client = createVtexClient(env.MESH_REQUEST_CONTEXT.state);

      const results = {
        success: [] as number[],
        failed: [] as { skuId: number; error: string }[],
      };

      for (const skuId of skuIds) {
        try {
          const result =
            await catalogSdk.postApiCatalogPvtSubcollectionBySubCollectionIdStockkeepingunit(
              {
                client: client as any,
                path: { subCollectionId: collectionId },
                body: { SkuId: skuId },
              } as any,
            );
          if (result.error) {
            results.failed.push({
              skuId,
              error:
                typeof result.error === "string"
                  ? result.error
                  : JSON.stringify(result.error),
            });
          } else {
            results.success.push(skuId);
          }
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

export const removeMultipleSkusFromCollection = (env: Env) =>
  createTool({
    id: "VTEX_REMOVE_MULTIPLE_SKUS_FROM_COLLECTION",
    description:
      "Remove multiple SKUs from a subcollection at once. This processes each SKU sequentially.",
    inputSchema: z.object({
      collectionId: z.coerce.number().describe("The subcollection ID"),
      skuIds: z
        .array(z.coerce.number())
        .describe("Array of SKU IDs to remove from the subcollection"),
    }),
    execute: async ({ context }) => {
      const { collectionId, skuIds } = context;
      const client = createVtexClient(env.MESH_REQUEST_CONTEXT.state);

      const results = {
        success: [] as number[],
        failed: [] as { skuId: number; error: string }[],
      };

      for (const skuId of skuIds) {
        try {
          const result =
            await catalogSdk.deleteApiCatalogPvtSubcollectionBySubCollectionIdStockkeepingunitBySkuId(
              {
                client: client as any,
                path: { subCollectionId: collectionId, skuId },
              } as any,
            );
          if (result.error) {
            results.failed.push({
              skuId,
              error:
                typeof result.error === "string"
                  ? result.error
                  : JSON.stringify(result.error),
            });
          } else {
            results.success.push(skuId);
          }
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
