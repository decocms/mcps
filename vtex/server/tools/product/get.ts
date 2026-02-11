import { createTool } from "@decocms/runtime/tools";
import { z } from "zod";
import { VTEXClient } from "../../lib/client.ts";
import type { Env } from "../../types/env.ts";

export const getProduct = (env: Env) =>
  createTool({
    id: "VTEX_GET_PRODUCT",
    description:
      "Get a product by its ID. Returns product details including name, description, category, brand, and status.",
    inputSchema: z.object({
      productId: z.number().describe("The product ID"),
    }),
    execute: async ({ context }) => {
      const credentials = env.MESH_REQUEST_CONTEXT.state;
      const client = new VTEXClient(credentials);
      return client.getProduct(context.productId);
    },
  });
