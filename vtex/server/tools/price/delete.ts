import { createTool } from "@decocms/runtime/tools";
import { z } from "zod";
import { VTEXClient } from "../../lib/client.ts";
import type { Env } from "../../types/env.ts";

export const deletePrice = (env: Env) =>
  createTool({
    id: "VTEX_DELETE_PRICE",
    description:
      "Delete all prices (base and fixed) for a SKU. Use with caution as this removes all pricing data for the SKU.",
    inputSchema: z.object({
      skuId: z.coerce.number().describe("The SKU ID to delete prices for"),
    }),
    execute: async ({ context }) => {
      const credentials = env.MESH_REQUEST_CONTEXT.state;
      const client = new VTEXClient(credentials);
      await client.deletePrice(context.skuId);
      return { success: true, skuId: context.skuId };
    },
  });
