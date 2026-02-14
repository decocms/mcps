import { createTool } from "@decocms/runtime/tools";
import { z } from "zod";
import { VTEXClient } from "../../lib/client.ts";
import type { Env } from "../../types/env.ts";

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
      const credentials = env.MESH_REQUEST_CONTEXT.state;
      const client = new VTEXClient(credentials);

      const skus = await client.listSkusByProduct(context.productId);

      const skuGridItems = await Promise.all(
        skus.map(async (sku) => {
          const inventory = await client.getInventoryBySku(sku.Id);

          const totalQuantity = inventory.balance.reduce(
            (sum, b) => sum + b.totalQuantity,
            0,
          );
          const reservedQuantity = inventory.balance.reduce(
            (sum, b) => sum + b.reservedQuantity,
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
