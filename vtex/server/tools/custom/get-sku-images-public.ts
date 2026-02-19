import { createTool } from "@decocms/runtime/tools";
import { z } from "zod";
import type { Env } from "../../types/env.ts";

const imageSchema = z.object({
  imageId: z.string(),
  imageLabel: z.string().nullable(),
  imageTag: z.string(),
  imageUrl: z.string(),
  imageText: z.string().nullable(),
});

const skuSchema = z.object({
  itemId: z.string(),
  name: z.string(),
  images: z.array(imageSchema),
});

const outputSchema = z.object({
  productId: z.string(),
  productName: z.string(),
  brand: z.string(),
  link: z.string(),
  items: z.array(skuSchema),
});

export const getSkuImagesPublic = (env: Env) =>
  createTool({
    id: "VTEX_GET_SKU_IMAGES_PUBLIC",
    description:
      "Get SKU images with publicly accessible URLs from VTEX CDN. Returns product information with all SKUs and their images. The imageUrl field contains direct links to images hosted on VTEX's CDN that can be accessed without authentication. Use this when you need to display or access images directly.",
    inputSchema: z.object({
      skuId: z.coerce.number().describe("The SKU ID to retrieve images for"),
    }),
    outputSchema,
    execute: async ({ context }) => {
      const credentials = env.MESH_REQUEST_CONTEXT.state;
      const { accountName, appKey, appToken } = credentials;

      const url = `https://${accountName}.vtexcommercestable.com.br/api/catalog_system/pub/products/search?fq=skuId:${context.skuId}`;

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

      const data: unknown[] = await response.json();

      if (!data || data.length === 0) {
        throw new Error(`Product not found for SKU ID: ${context.skuId}`);
      }

      const product = data[0] as {
        productId: string;
        productName: string;
        brand: string;
        link: string;
        items: Array<{
          itemId: string;
          name: string;
          images: Array<{
            imageId: string;
            imageLabel: string | null;
            imageTag: string;
            imageUrl: string;
            imageText: string | null;
          }>;
        }>;
      };

      return {
        productId: product.productId,
        productName: product.productName,
        brand: product.brand,
        link: product.link,
        items: product.items.map((item) => ({
          itemId: item.itemId,
          name: item.name,
          images: item.images.map((img) => ({
            imageId: img.imageId,
            imageLabel: img.imageLabel || null,
            imageTag: img.imageTag,
            imageUrl: img.imageUrl,
            imageText: img.imageText || null,
          })),
        })),
      };
    },
  });
