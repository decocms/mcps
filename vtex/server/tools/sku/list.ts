import { createTool } from "@decocms/runtime/tools";
import { z } from "zod";
import { VTEXClient } from "../../lib/client.ts";
import type { Env } from "../../types/env.ts";

const outputSchema = z.object({
  items: z.array(
    z.object({
      Id: z.number(),
      ProductId: z.number(),
      IsActive: z.boolean(),
      Name: z.string(),
      RefId: z.string(),
      IsKit: z.boolean().optional(),
      MeasurementUnit: z.string().optional(),
      UnitMultiplier: z.number().optional(),
    }),
  ),
});

export const listSkusByProduct = (env: Env) =>
  createTool({
    id: "VTEX_LIST_SKUS_BY_PRODUCT",
    description: "List all SKUs for a specific product.",
    inputSchema: z.object({
      productId: z.coerce.number().describe("The product ID"),
    }),
    outputSchema,
    execute: async ({ context }) => {
      const credentials = env.MESH_REQUEST_CONTEXT.state;
      const client = new VTEXClient(credentials);
      const result = await client.listSkusByProduct(context.productId);
      return outputSchema.parse({ items: result });
    },
  });
