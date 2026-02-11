import { createTool } from "@decocms/runtime/tools";
import { z } from "zod";
import { VTEXClient } from "../../lib/client.ts";
import type { Env } from "../../types/env.ts";

export const updateProduct = (env: Env) =>
  createTool({
    id: "VTEX_UPDATE_PRODUCT",
    description: "Update an existing product.",
    inputSchema: z.object({
      productId: z.number().describe("Product ID to update"),
      Name: z.string().optional().describe("Product name"),
      CategoryId: z.number().optional().describe("Category ID"),
      BrandId: z.number().optional().describe("Brand ID"),
      LinkId: z.string().optional().describe("URL slug"),
      Description: z.string().optional().describe("Product description"),
      IsActive: z.boolean().optional().describe("Whether product is active"),
    }),
    execute: async ({ context }) => {
      const { productId, ...data } = context;
      const credentials = env.DECO_CHAT_REQUEST_CONTEXT.state;
      const client = new VTEXClient(credentials);
      return client.updateProduct(productId, data);
    },
  });
