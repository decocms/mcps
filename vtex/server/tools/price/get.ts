import { createTool } from "@decocms/runtime/tools";
import { z } from "zod";
import { VTEXClient } from "../../lib/client.ts";
import type { Env } from "../../types/env.ts";

export const getPrice = (env: Env) =>
  createTool({
    id: "VTEX_GET_PRICE",
    description:
      "Get the base price of a SKU by its ID. Returns pricing data including costPrice, markup, basePrice, listPrice, and any fixed prices configured.",
    inputSchema: z.object({
      skuId: z.number().describe("The SKU ID to get the price for"),
    }),
    execute: async ({ context }) => {
      const credentials = env.MESH_REQUEST_CONTEXT.state;
      const client = new VTEXClient(credentials);
      return client.getPrice(context.skuId);
    },
  });
