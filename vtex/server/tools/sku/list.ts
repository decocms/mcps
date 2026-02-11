import { createTool } from "@decocms/runtime/tools";
import { z } from "zod";
import { VTEXClient } from "../../lib/client.ts";
import type { Env } from "../../types/env.ts";

export const listSkusByProduct = (env: Env) =>
  createTool({
    id: "VTEX_LIST_SKUS_BY_PRODUCT",
    description: "List all SKUs for a specific product.",
    inputSchema: z.object({
      productId: z.number().describe("The product ID"),
    }),
    execute: async ({ context }) => {
      const credentials = env.DECO_CHAT_REQUEST_CONTEXT.state;
      const client = new VTEXClient(credentials);
      return client.listSkusByProduct(context.productId);
    },
  });
