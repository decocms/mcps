import { createTool } from "@decocms/runtime/tools";
import { z } from "zod";
import { VTEXClient, getCredentials } from "../../lib/client.ts";
import type { Env } from "../../types/env.ts";

export const getSku = (env: Env) =>
  createTool({
    id: "VTEX_GET_SKU",
    description: "Get SKU details by ID.",
    inputSchema: z.object({
      skuId: z.number().describe("The SKU ID"),
    }),
    execute: async ({ context }) => {
      const client = new VTEXClient(getCredentials(env));
      return client.getSku(context.skuId);
    },
  });
