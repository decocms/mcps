/* eslint-disable @typescript-eslint/no-explicit-any */
import { createTool } from "@decocms/runtime/tools";
import { z } from "zod";
import * as catalogSdk from "../../generated/catalog/sdk.gen.ts";
import type { Env } from "../../types/env.ts";
import { createVtexClient } from "../../lib/client-factory.ts";

const skuFileSchema = z
  .object({
    Id: z.number(),
    ArchiveId: z.number(),
    SkuId: z.number(),
    Name: z.string(),
    IsMain: z.boolean(),
    Label: z.string().nullable(),
    Url: z.string(),
  })
  .passthrough();

const skuWithImagesSchema = z
  .object({
    Id: z.number(),
    ProductId: z.number(),
    IsActive: z.boolean(),
    Name: z.string(),
    RefId: z.string(),
    Images: z.array(skuFileSchema),
  })
  .passthrough();

const outputSchema = z.object({
  product: z
    .object({
      Id: z.number(),
      Name: z.string(),
      DepartmentId: z.number(),
      CategoryId: z.number(),
      BrandId: z.number(),
      LinkId: z.string(),
      RefId: z.string(),
      IsVisible: z.boolean(),
      Description: z.string(),
      DescriptionShort: z.string(),
      ReleaseDate: z.string(),
      KeyWords: z.string(),
      Title: z.string(),
      IsActive: z.boolean(),
      TaxCode: z.string(),
      MetaTagDescription: z.string(),
      ShowWithoutStock: z.boolean(),
      Score: z.number().nullable(),
    })
    .passthrough(),
  skus: z.array(skuWithImagesSchema),
});

export const getProductWithImages = (env: Env) =>
  createTool({
    id: "VTEX_GET_PRODUCT_WITH_IMAGES",
    description:
      "Get complete product information including all SKUs and their images. Returns product details (name, description, category, brand) and all SKUs with their images. Each image includes: ID, name, URL (imageUrl), label, and whether it's the main image. Useful when you need the complete product structure with visual assets.",
    inputSchema: z.object({
      productId: z.coerce.number().describe("The product ID to retrieve"),
    }),
    outputSchema,
    execute: async ({ context }) => {
      const client = createVtexClient(env.MESH_REQUEST_CONTEXT.state);

      const [productResult, skusResult] = await Promise.all([
        catalogSdk.getProductbyid({
          client: client as any,
          path: { productId: context.productId },
        } as any),
        catalogSdk.skulistbyProductId({
          client: client as any,
          path: { productId: context.productId },
        } as any),
      ]);

      if (productResult.error) {
        throw new Error(
          typeof productResult.error === "string"
            ? productResult.error
            : JSON.stringify(productResult.error),
        );
      }
      if (skusResult.error) {
        throw new Error(
          typeof skusResult.error === "string"
            ? skusResult.error
            : JSON.stringify(skusResult.error),
        );
      }

      const product = productResult.data as any;
      const skus = (skusResult.data ?? []) as any[];

      const skusWithImages = await Promise.all(
        skus.map(async (sku: any) => {
          const filesResult =
            await catalogSdk.getApiCatalogPvtStockkeepingunitBySkuIdFile({
              client: client as any,
              path: { skuId: sku.Id },
            } as any);
          const images = filesResult.error
            ? []
            : ((filesResult.data ?? []) as any[]);
          return {
            Id: sku.Id,
            ProductId: sku.ProductId,
            IsActive: sku.IsActive,
            Name: sku.Name,
            RefId: sku.RefId,
            Images: images,
          };
        }),
      );

      return { product, skus: skusWithImages };
    },
  });
