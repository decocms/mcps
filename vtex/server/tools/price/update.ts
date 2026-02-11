import { createTool } from "@decocms/runtime/tools";
import { z } from "zod";
import { VTEXClient } from "../../lib/client.ts";
import type { Env } from "../../types/env.ts";

export const updatePrice = (env: Env) =>
  createTool({
    id: "VTEX_UPDATE_PRICE",
    description:
      "Create or update the base price of a SKU. You can set costPrice, markup, basePrice, and listPrice. The basePrice can be calculated automatically from costPrice + markup if not provided directly.",
    inputSchema: z.object({
      skuId: z.number().describe("The SKU ID to update the price for"),
      costPrice: z
        .number()
        .nullable()
        .optional()
        .describe("The cost price of the SKU (optional)"),
      markup: z
        .number()
        .optional()
        .describe("The markup percentage to apply over cost price (optional)"),
      basePrice: z
        .number()
        .optional()
        .describe(
          "The base selling price (optional, can be calculated from costPrice + markup)",
        ),
      listPrice: z
        .number()
        .nullable()
        .optional()
        .describe(
          "The list price / 'price from' shown to customers (optional)",
        ),
    }),
    execute: async ({ context }) => {
      const credentials = env.DECO_CHAT_REQUEST_CONTEXT.state;
      const client = new VTEXClient(credentials);
      const { skuId, ...priceData } = context;
      await client.createOrUpdatePrice(skuId, priceData);
      return { success: true, skuId };
    },
  });
