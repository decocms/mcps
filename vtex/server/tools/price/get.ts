import { createTool } from "@decocms/runtime/tools";
import { z } from "zod";
import { VTEXClient } from "../../lib/client.ts";
import type { Env } from "../../types/env.ts";

const outputSchema = z.object({
  itemId: z.string(),
  listPrice: z.number().nullable(),
  costPrice: z.number().nullable(),
  markup: z.number().nullable(),
  basePrice: z.number(),
  fixedPrices: z.array(
    z.object({
      tradePolicyId: z.string(),
      value: z.number(),
      listPrice: z.number().nullable(),
      minQuantity: z.number(),
      dateRange: z
        .object({
          from: z.string(),
          to: z.string(),
        })
        .optional(),
    }),
  ),
});

export const getPrice = (env: Env) =>
  createTool({
    id: "VTEX_GET_PRICE",
    description:
      "Get the base price of a SKU by its ID. Returns pricing data including costPrice, markup, basePrice, listPrice, and any fixed prices configured.",
    inputSchema: z.object({
      skuId: z.coerce.number().describe("The SKU ID to get the price for"),
    }),
    outputSchema,
    execute: async ({ context }) => {
      const credentials = env.MESH_REQUEST_CONTEXT.state;
      const client = new VTEXClient(credentials);
      const result = await client.getPrice(context.skuId);
      return outputSchema.parse(result);
    },
  });
