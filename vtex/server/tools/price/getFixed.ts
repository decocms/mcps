import { createTool } from "@decocms/runtime/tools";
import { z } from "zod";
import { VTEXClient } from "../../lib/client.ts";
import type { Env } from "../../types/env.ts";

const fixedPriceSchema = z.object({
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
});

const outputSchema = z.array(fixedPriceSchema);

export const getFixedPrices = (env: Env) =>
  createTool({
    id: "VTEX_GET_FIXED_PRICES",
    description:
      "Get all fixed prices configured for a SKU. Fixed prices override the base price for specific trade policies, quantities, or date ranges.",
    inputSchema: z.object({
      skuId: z.coerce.number().describe("The SKU ID to get fixed prices for"),
    }),
    outputSchema,
    execute: async ({ context }) => {
      const credentials = env.MESH_REQUEST_CONTEXT.state;
      const client = new VTEXClient(credentials);
      const result = await client.getFixedPrices(context.skuId);
      return outputSchema.parse(result);
    },
  });
