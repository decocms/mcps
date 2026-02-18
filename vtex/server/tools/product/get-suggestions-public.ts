import { createTool } from "@decocms/runtime/tools";
import { z } from "zod";
import { VTEXClient } from "../../lib/client.ts";
import type { Env } from "../../types/env.ts";

const productSchema = z.object({
  productId: z.string(),
  productName: z.string(),
  brand: z.string(),
  brandId: z.number(),
  brandImageUrl: z.string().nullable(),
  linkText: z.string(),
  productReference: z.string(),
  categoryId: z.string(),
  productTitle: z.string(),
  metaTagDescription: z.string(),
  clusterHighlights: z.record(z.string(), z.string()),
  productClusters: z.record(z.string(), z.string()),
  searchableClusters: z.record(z.string(), z.string()),
  categories: z.array(z.string()),
  categoriesIds: z.array(z.string()),
  link: z.string(),
  description: z.string(),
  items: z.array(z.record(z.string(), z.unknown())),
});

const outputSchema = z.array(productSchema);

export const getProductSuggestionsPublic = (env: Env) =>
  createTool({
    id: "VTEX_GET_PRODUCT_SUGGESTIONS_PUBLIC",
    description:
      "Get cross-selling product suggestions for a given product using the public VTEX API — no API key or token required.",
    inputSchema: z.object({
      productId: z.coerce
        .number()
        .describe("The product ID to get suggestions for"),
    }),
    outputSchema,
    execute: async ({ context }) => {
      const credentials = env.MESH_REQUEST_CONTEXT.state;
      const client = new VTEXClient(credentials);
      const results = await client.getCrossSellingSuggestionsPublic(
        context.productId,
      );
      return outputSchema.parse(results);
    },
  });
