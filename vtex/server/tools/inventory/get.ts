import { createTool } from "@decocms/runtime/tools";
import { z } from "zod";
import { VTEXClient } from "../../lib/client.ts";
import type { Env } from "../../types/env.ts";

const outputSchema = z.object({
  skuId: z.string(),
  balance: z.array(
    z.object({
      warehouseId: z.string(),
      warehouseName: z.string(),
      totalQuantity: z.number(),
      reservedQuantity: z.number(),
      hasUnlimitedQuantity: z.boolean(),
    }),
  ),
});

export const getInventoryBySku = (env: Env) =>
  createTool({
    id: "VTEX_GET_INVENTORY_BY_SKU",
    description: "Get inventory levels for a SKU across all warehouses.",
    inputSchema: z.object({
      skuId: z.coerce.number().describe("The SKU ID"),
    }),
    outputSchema,
    execute: async ({ context }) => {
      const credentials = env.MESH_REQUEST_CONTEXT.state;
      const client = new VTEXClient(credentials);
      const result = await client.getInventoryBySku(context.skuId);
      return outputSchema.parse(result);
    },
  });
