import { createTool } from "@decocms/runtime/tools";
import { z } from "zod";
import { VTEXClient } from "../../lib/client.ts";
import type { Env } from "../../types/env.ts";

const skuSchema = z.object({
  itemId: z.string(),
  name: z.string(),
  nameComplete: z.string(),
  complementName: z.string(),
  ean: z.string(),
  referenceId: z.array(z.object({ Key: z.string(), Value: z.string() })),
  measurementUnit: z.string(),
  unitMultiplier: z.number(),
  images: z.array(
    z.object({
      imageId: z.string(),
      imageLabel: z.string().nullable(),
      imageTag: z.string(),
      imageUrl: z.string(),
      imageText: z.string(),
    }),
  ),
  sellers: z.array(
    z.object({
      sellerId: z.string(),
      sellerName: z.string(),
      addToCartLink: z.string(),
      sellerDefault: z.boolean(),
      commertialOffer: z.object({
        Price: z.number(),
        ListPrice: z.number(),
        PriceWithoutDiscount: z.number(),
        RewardValue: z.number(),
        PriceValidUntil: z.string().nullable(),
        AvailableQuantity: z.number(),
        IsAvailable: z.boolean(),
        Tax: z.number(),
      }),
    }),
  ),
});

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
  items: z.array(skuSchema),
});

const outputSchema = z.object({
  products: z.array(productSchema),
});

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
      const products = await client.getCrossSellingSuggestionsPublic(
        context.productId,
      );
      return { products };
    },
  });
