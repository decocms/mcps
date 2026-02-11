import { createTool } from "@decocms/runtime/tools";
import { z } from "zod";
import { VTEXClient } from "../../lib/client.ts";
import type { Env } from "../../types/env.ts";

export const getComputedPrice = (env: Env) =>
  createTool({
    id: "VTEX_GET_COMPUTED_PRICE",
    description:
      "Get the final computed price of a SKU for a specific price table/trade policy. Returns the selling price after all pricing rules and pipelines are applied.",
    inputSchema: z.object({
      skuId: z.number().describe("The SKU ID to get the computed price for"),
      priceTableId: z
        .string()
        .describe(
          "The price table ID or trade policy ID (e.g., '1' for default)",
        ),
    }),
    execute: async ({ context }) => {
      const credentials = env.DECO_CHAT_REQUEST_CONTEXT.state;
      const client = new VTEXClient(credentials);
      return client.getComputedPrice(context.skuId, context.priceTableId);
    },
  });
