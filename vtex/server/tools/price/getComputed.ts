import { createTool } from "@decocms/runtime/tools";
import { z } from "zod";
import { VTEXClient } from "../../lib/client.ts";
import type { Env } from "../../types/env.ts";

const outputSchema = z.object({
  tradePolicyId: z.string(),
  listPrice: z.number().nullable(),
  sellingPrice: z.number(),
  priceValidUntil: z.string().nullable(),
});

export const getComputedPrice = (env: Env) =>
  createTool({
    id: "VTEX_GET_COMPUTED_PRICE",
    description:
      "Get the final computed price of a SKU for a specific price table/trade policy. Returns the selling price after all pricing rules and pipelines are applied.",
    inputSchema: z.object({
      skuId: z.coerce
        .number()
        .describe("The SKU ID to get the computed price for"),
      priceTableId: z
        .string()
        .describe(
          "The price table ID or trade policy ID (e.g., '1' for default)",
        ),
    }),
    outputSchema,
    execute: async ({ context }) => {
      const credentials = env.MESH_REQUEST_CONTEXT.state;
      const client = new VTEXClient(credentials);
      const result = await client.getComputedPrice(
        context.skuId,
        context.priceTableId,
      );
      return outputSchema.parse(result);
    },
  });
