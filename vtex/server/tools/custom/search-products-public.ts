import { createTool } from "@decocms/runtime/tools";
import { z } from "zod";
import type { Env } from "../../types/env.ts";

const skuSchema = z
  .object({
    itemId: z.string(),
    name: z.string(),
    nameComplete: z.string(),
    complementName: z.string(),
    ean: z.string(),
    referenceId: z.array(
      z.object({ Key: z.string(), Value: z.string() }).passthrough(),
    ),
    measurementUnit: z.string(),
    unitMultiplier: z.number(),
    images: z.array(
      z
        .object({
          imageId: z.string(),
          imageLabel: z.string().nullable(),
          imageTag: z.string(),
          imageUrl: z.string(),
          imageText: z.string(),
        })
        .passthrough(),
    ),
    sellers: z.array(
      z
        .object({
          sellerId: z.string(),
          sellerName: z.string(),
          addToCartLink: z.string(),
          sellerDefault: z.boolean(),
          commertialOffer: z
            .object({
              Price: z.number(),
              ListPrice: z.number(),
              PriceWithoutDiscount: z.number(),
              RewardValue: z.number(),
              PriceValidUntil: z.string().nullable(),
              AvailableQuantity: z.number(),
              IsAvailable: z.boolean(),
              Tax: z.number(),
            })
            .passthrough(),
        })
        .passthrough(),
    ),
  })
  .passthrough();

const productSchema = z
  .object({
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
  })
  .passthrough();

const outputSchema = z.object({
  products: z.array(productSchema),
});

export const searchProductsPublic = (env: Env) =>
  createTool({
    id: "VTEX_SEARCH_PRODUCTS_PUBLIC",
    description:
      "Search for products using the public VTEX Catalog API — no API key or token required. Supports full-text search, category/brand/collection filters, price range, and ordering. Returns products with SKUs, images, prices, and availability.",
    inputSchema: z.object({
      query: z
        .string()
        .optional()
        .describe("Full-text search query (e.g. 'blue sneaker')"),
      categoryId: z.coerce
        .number()
        .optional()
        .describe("Filter by category ID"),
      brandId: z.coerce.number().optional().describe("Filter by brand ID"),
      collectionId: z.coerce
        .number()
        .optional()
        .describe("Filter by collection/cluster ID"),
      priceFrom: z.coerce.number().optional().describe("Minimum price filter"),
      priceTo: z.coerce.number().optional().describe("Maximum price filter"),
      from: z.coerce
        .number()
        .optional()
        .describe("Start index for pagination (default: 0)"),
      to: z.coerce
        .number()
        .optional()
        .describe("End index for pagination (default: 9, max: 49 per request)"),
      orderBy: z
        .string()
        .optional()
        .describe(
          "Sort order. Options: OrderByPriceDESC, OrderByPriceASC, OrderByTopSaleDESC, OrderByReviewRateDESC, OrderByNameASC, OrderByNameDESC, OrderByReleaseDateDESC, OrderByBestDiscountDESC",
        ),
      fq: z
        .string()
        .optional()
        .describe(
          "Raw filter query for advanced use (e.g. 'C:/1/2/', 'B:5', 'specificationFilter_100:Blue')",
        ),
    }),
    outputSchema,
    execute: async ({ context }) => {
      const credentials = env.MESH_REQUEST_CONTEXT.state;
      const { accountName, appKey, appToken } = credentials;

      const fqFilters: string[] = [];
      if (context.categoryId !== undefined)
        fqFilters.push(`C:/${context.categoryId}/`);
      if (context.brandId !== undefined) fqFilters.push(`B:${context.brandId}`);
      if (context.collectionId !== undefined)
        fqFilters.push(`productClusterIds:${context.collectionId}`);
      if (context.priceFrom !== undefined)
        fqFilters.push(`P:[${context.priceFrom} TO ${context.priceTo ?? "*"}]`);
      if (context.fq !== undefined) fqFilters.push(context.fq);

      const params = new URLSearchParams();
      if (context.query !== undefined) params.set("ft", context.query);
      for (const fq of fqFilters) params.append("fq", fq);
      if (context.from !== undefined) params.set("_from", String(context.from));
      if (context.to !== undefined) params.set("_to", String(context.to));
      if (context.orderBy !== undefined) params.set("O", context.orderBy);

      const url = `https://${accountName}.vtexcommercestable.com.br/api/catalog_system/pub/products/search?${params.toString()}`;

      const response = await fetch(url, {
        headers: {
          Accept: "application/json",
          "Content-Type": "application/json",
          ...(appKey && { "X-VTEX-API-AppKey": appKey }),
          ...(appToken && { "X-VTEX-API-AppToken": appToken }),
        },
      });

      if (!response.ok) {
        throw new Error(
          `VTEX API Error: ${response.status} - ${await response.text()}`,
        );
      }

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const products: any[] = await response.json();
      return { products: products ?? [] };
    },
  });
