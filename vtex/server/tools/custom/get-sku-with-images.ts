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

const outputSchema = z.object({
  sku: z
    .object({
      Id: z.number(),
      ProductId: z.number(),
      IsActive: z.boolean(),
      Name: z.string(),
      RefId: z.string(),
      PackagedHeight: z.number(),
      PackagedLength: z.number(),
      PackagedWidth: z.number(),
      PackagedWeightKg: z.number(),
      Height: z.number(),
      Length: z.number(),
      Width: z.number(),
      WeightKg: z.number(),
      CubicWeight: z.number(),
      IsKit: z.boolean(),
      CreationDate: z.string(),
      MeasurementUnit: z.string(),
      UnitMultiplier: z.number(),
    })
    .passthrough(),
  images: z.array(skuFileSchema),
});

export const getSkuWithImages = (env: Env) =>
  createTool({
    id: "VTEX_GET_SKU_WITH_IMAGES",
    description:
      "Get complete SKU information including all images. Returns SKU details (name, dimensions, weight, etc.) and all associated images with their URLs. Each image includes: ID, name, URL (imageUrl), label, and whether it's the main image.",
    inputSchema: z.object({
      skuId: z.coerce.number().describe("The SKU ID to retrieve"),
    }),
    outputSchema,
    execute: async ({ context }) => {
      const client = createVtexClient(env.MESH_REQUEST_CONTEXT.state);

      const [skuResult, filesResult] = await Promise.all([
        catalogSdk.skuContext({
          client: client as any,
          path: { skuId: context.skuId },
        } as any),
        catalogSdk.getApiCatalogPvtStockkeepingunitBySkuIdFile({
          client: client as any,
          path: { skuId: context.skuId },
        } as any),
      ]);

      if (skuResult.error) {
        throw new Error(
          typeof skuResult.error === "string"
            ? skuResult.error
            : JSON.stringify(skuResult.error),
        );
      }

      const sku = skuResult.data as any;
      const images = filesResult.error
        ? []
        : ((filesResult.data ?? []) as any[]);

      return { sku, images };
    },
  });
