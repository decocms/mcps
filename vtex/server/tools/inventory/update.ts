import { createTool } from "@decocms/runtime/tools";
import { z } from "zod";
import { VTEXClient } from "../../lib/client.ts";
import type { Env } from "../../types/env.ts";

export const updateInventory = (env: Env) =>
  createTool({
    id: "VTEX_UPDATE_INVENTORY",
    description: "Update inventory quantity for a SKU in a specific warehouse.",
    inputSchema: z.object({
      skuId: z.coerce.number().describe("The SKU ID"),
      warehouseId: z.string().describe("The warehouse ID"),
      quantity: z.coerce.number().describe("New quantity to set"),
      unlimitedQuantity: z.coerce
        .boolean()
        .optional()
        .describe("Set to true for unlimited stock"),
    }),
    execute: async ({ context }) => {
      const credentials = env.MESH_REQUEST_CONTEXT.state;
      const client = new VTEXClient(credentials);
      await client.updateInventory(context.skuId, context.warehouseId, {
        quantity: context.quantity,
        unlimitedQuantity: context.unlimitedQuantity,
      });
      return { success: true };
    },
  });
