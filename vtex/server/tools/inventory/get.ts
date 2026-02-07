import { createTool } from "@decocms/runtime/tools";
import { z } from "zod";
import { VTEXClient, getCredentials } from "../../lib/client.ts";
import type { Env } from "../../types/env.ts";

export const getInventoryBySku = (env: Env) =>
  createTool({
    id: "VTEX_GET_INVENTORY_BY_SKU",
    description: "Get inventory levels for a SKU across all warehouses.",
    inputSchema: z.object({
      skuId: z.number().describe("The SKU ID"),
    }),
    execute: async ({ context }) => {
      const client = new VTEXClient(getCredentials(env));
      return client.getInventoryBySku(context.skuId);
    },
  });
