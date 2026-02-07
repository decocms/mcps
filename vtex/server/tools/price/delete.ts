import { createTool } from "@decocms/runtime/tools";
import { z } from "zod";
import { VTEXClient, getCredentials } from "../../lib/client.ts";
import type { Env } from "../../types/env.ts";

export const deletePrice = (env: Env) =>
  createTool({
    id: "VTEX_DELETE_PRICE",
    description:
      "Delete all prices (base and fixed) for a SKU. Use with caution as this removes all pricing data for the SKU.",
    inputSchema: z.object({
      skuId: z.number().describe("The SKU ID to delete prices for"),
    }),
    execute: async ({ context }) => {
      const client = new VTEXClient(getCredentials(env));
      await client.deletePrice(context.skuId);
      return { success: true, skuId: context.skuId };
    },
  });
