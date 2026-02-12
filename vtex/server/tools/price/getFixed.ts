import { createTool } from "@decocms/runtime/tools";
import { z } from "zod";
import { VTEXClient } from "../../lib/client.ts";
import type { Env } from "../../types/env.ts";

export const getFixedPrices = (env: Env) =>
  createTool({
    id: "VTEX_GET_FIXED_PRICES",
    description:
      "Get all fixed prices configured for a SKU. Fixed prices override the base price for specific trade policies, quantities, or date ranges.",
    inputSchema: z.object({
      skuId: z.number().describe("The SKU ID to get fixed prices for"),
    }),
    outputSchema: z.object({
      fixedPrices: z.array(
        z.object({
          tradePolicyId: z.string().describe("Trade policy (price table) ID"),
          value: z.number().describe("Price value in cents"),
          listPrice: z.number().nullable().describe("List price in cents"),
          minQuantity: z.number().describe("Minimum quantity for this price"),
          dateRange: z
            .object({
              from: z.string().describe("Start date (ISO format)"),
              to: z.string().describe("End date (ISO format)"),
            })
            .optional()
            .describe("Date range for this price"),
        }),
      ),
    }),
    execute: async ({ context }) => {
      const credentials = env.MESH_REQUEST_CONTEXT.state;
      const client = new VTEXClient(credentials);
      const fixedPrices = await client.getFixedPrices(context.skuId);
      return { fixedPrices };
    },
  });
