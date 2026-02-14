import { createTool } from "@decocms/runtime/tools";
import { z } from "zod";
import { VTEXClient } from "../../lib/client.ts";
import type { Env } from "../../types/env.ts";

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
      const credentials = env.MESH_REQUEST_CONTEXT.state;
      const client = new VTEXClient(credentials);

      // Buscar informações do SKU e suas imagens em paralelo
      const [sku, images] = await Promise.all([
        client.getSku(context.skuId),
        client.getSkuFiles(context.skuId),
      ]);

      return {
        sku,
        images,
      };
    },
  });
