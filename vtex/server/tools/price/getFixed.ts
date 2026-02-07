import { createTool } from "@decocms/runtime/tools";
import { z } from "zod";
import { VTEXClient, getCredentials } from "../../lib/client.ts";
import type { Env } from "../../types/env.ts";

export const getFixedPrices = (env: Env) =>
  createTool({
    id: "VTEX_GET_FIXED_PRICES",
    description:
      "Get all fixed prices configured for a SKU. Fixed prices override the base price for specific trade policies, quantities, or date ranges.",
    inputSchema: z.object({
      skuId: z.number().describe("The SKU ID to get fixed prices for"),
    }),
    execute: async ({ context }) => {
      const client = new VTEXClient(getCredentials(env));
      return client.getFixedPrices(context.skuId);
    },
  });
