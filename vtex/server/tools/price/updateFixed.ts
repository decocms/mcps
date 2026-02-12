import { createTool } from "@decocms/runtime/tools";
import { z } from "zod";
import { VTEXClient } from "../../lib/client.ts";
import type { Env } from "../../types/env.ts";

export const updateFixedPrice = (env: Env) =>
  createTool({
    id: "VTEX_UPDATE_FIXED_PRICE",
    description:
      "Create or update fixed prices for a SKU in a specific price table/trade policy. Fixed prices override base prices for specific contexts like promotions, B2B pricing, or time-limited offers.",
    inputSchema: z.object({
      skuId: z.coerce
        .number()
        .describe("The SKU ID to update fixed prices for"),
      priceTableId: z
        .string()
        .describe(
          "The price table ID or trade policy ID (e.g., '1' for default)",
        ),
      fixedPrices: z
        .array(
          z.object({
            value: z.coerce.number().describe("The fixed selling price"),
            listPrice: z.coerce
              .number()
              .nullable()
              .optional()
              .describe("The list price / 'price from' (optional)"),
            minQuantity: z.coerce
              .number()
              .describe("Minimum quantity for this price to apply (usually 1)"),
            dateRange: z
              .object({
                from: z.string().describe("Start date in RFC3339 format"),
                to: z.string().describe("End date in RFC3339 format"),
              })
              .optional()
              .describe("Optional date range for time-limited prices"),
          }),
        )
        .describe("Array of fixed prices to set"),
    }),
    execute: async ({ context }) => {
      const credentials = env.MESH_REQUEST_CONTEXT.state;
      const client = new VTEXClient(credentials);
      await client.createOrUpdateFixedPrice(
        context.skuId,
        context.priceTableId,
        context.fixedPrices,
      );
      return {
        success: true,
        skuId: context.skuId,
        priceTableId: context.priceTableId,
      };
    },
  });
