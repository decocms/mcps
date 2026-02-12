import { createTool } from "@decocms/runtime/tools";
import { z } from "zod";
import { VTEXClient } from "../../lib/client.ts";
import type { Env } from "../../types/env.ts";

const outputSchema = z.object({
  data: z
    .record(z.string(), z.array(z.number()))
    .describe("Map of product IDs to SKU IDs arrays"),
  range: z.object({
    total: z.number().describe("Total number of products"),
    from: z.number().describe("Start index used"),
    to: z.number().describe("End index used"),
  }),
});

export const listProducts = (env: Env) =>
  createTool({
    id: "VTEX_LIST_PRODUCTS",
    description:
      "List product and SKU IDs with pagination. Use from and to for pagination (max 250 records per request).",
    inputSchema: z.object({
      from: z.coerce.number().optional().describe("Start index (default: 1)"),
      to: z.coerce
        .number()
        .optional()
        .describe("End index (default: 250, max: 250)"),
    }),
    outputSchema,
    execute: async ({ context }) => {
      const credentials = env.MESH_REQUEST_CONTEXT.state;
      const client = new VTEXClient(credentials);
      const result = await client.listProductIds(context.from, context.to);
      return outputSchema.parse(result);
    },
  });
