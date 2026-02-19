/* eslint-disable @typescript-eslint/no-explicit-any */
import { createTool } from "@decocms/runtime/tools";
import { z } from "zod";
import * as catalogSdk from "../../generated/catalog/sdk.gen.ts";
import * as logisticsSdk from "../../generated/logistics/sdk.gen.ts";
import type { Env } from "../../types/env.ts";
import { createVtexClient } from "../../lib/client-factory.ts";

const skuGridItemSchema = z.object({
  skuId: z.number(),
  skuName: z.string(),
  isActive: z.boolean(),
  hasStock: z.boolean(),
  totalQuantity: z.number(),
  reservedQuantity: z.number(),
  availableQuantity: z.number(),
});

const outputSchema = z.object({
  productId: z.number(),
  totalSkus: z.number(),
  activeSkus: z.number(),
  skusWithStock: z.number(),
  gridCompleteness: z.number(),
  skus: z.array(skuGridItemSchema),
});

export const getProductGridStatus = (env: Env) =>
  createTool({
    id: "VTEX_GET_PRODUCT_GRID_STATUS",
    description:
      "Get the size grid completeness status for a product. Returns how many SKUs (sizes/variants) have stock vs total, with a completeness percentage. Products with gridCompleteness >= 80% should be prioritized; below 80% should be deprioritized in product listing pages. Each SKU represents a size/variant combination.",
    inputSchema: z.object({
      productId: z.coerce
        .number()
        .describe("The product ID to check grid status for"),
    }),
    outputSchema,
    execute: async ({ context }) => {
      const client = createVtexClient(env.MESH_REQUEST_CONTEXT.state);

      const skusResult = await catalogSdk.skulistbyProductId({
        client: client as any,
        path: { productId: context.productId },
      } as any);

      if (skusResult.error) {
        throw new Error(
          typeof skusResult.error === "string"
            ? skusResult.error
            : JSON.stringify(skusResult.error),
        );
      }

      const skus = (skusResult.data ?? []) as any[];

      const skuGridItems = await Promise.all(
        skus.map(async (sku: any) => {
          const inventoryResult = await logisticsSdk.inventoryBySku({
            client: client as any,
            path: { skuId: String(sku.Id) },
          } as any);

          const balance = (
            inventoryResult.error
              ? []
              : ((inventoryResult.data as any)?.balance ?? [])
          ) as any[];
          const totalQuantity = balance.reduce(
            (sum: number, b: any) => sum + (b.totalQuantity ?? 0),
            0,
          );
          const reservedQuantity = balance.reduce(
            (sum: number, b: any) => sum + (b.reservedQuantity ?? 0),
            0,
          );
          const availableQuantity = totalQuantity - reservedQuantity;

          return {
            skuId: sku.Id,
            skuName: sku.Name,
            isActive: sku.IsActive,
            hasStock: availableQuantity > 0,
            totalQuantity,
            reservedQuantity,
            availableQuantity,
          };
        }),
      );

      const activeSkus = skuGridItems.filter((s) => s.isActive).length;
      const skusWithStock = skuGridItems.filter(
        (s) => s.isActive && s.hasStock,
      ).length;
      const gridCompleteness =
        activeSkus > 0 ? Math.round((skusWithStock / activeSkus) * 100) : 0;

      return outputSchema.parse({
        productId: context.productId,
        totalSkus: skus.length,
        activeSkus,
        skusWithStock,
        gridCompleteness,
        skus: skuGridItems,
      });
    },
  });
