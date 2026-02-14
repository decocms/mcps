import { createTool } from "@decocms/runtime/tools";
import { z } from "zod";
import { VTEXClient } from "../../lib/client.ts";
import type { Env } from "../../types/env.ts";

const specificationSchema = z.object({
  Id: z.number(),
  Name: z.string(),
  Value: z.array(z.string()),
});

const outputSchema = z.object({
  specifications: z.array(specificationSchema),
});

export const getProductSpecifications = (env: Env) =>
  createTool({
    id: "VTEX_GET_PRODUCT_SPECIFICATIONS",
    description:
      "Get all specifications (attributes) of a product such as Estampa (print/pattern), Material, Cor (color), Composição (composition), and other custom fields configured in the store. Useful for visual narrative grouping and product categorization.",
    inputSchema: z.object({
      productId: z.coerce
        .number()
        .describe("The product ID to get specifications for"),
    }),
    outputSchema,
    execute: async ({ context }) => {
      const credentials = env.MESH_REQUEST_CONTEXT.state;
      const client = new VTEXClient(credentials);
      const result = await client.getProductSpecifications(context.productId);
      return outputSchema.parse({ specifications: result });
    },
  });
