import { createTool } from "@decocms/runtime/tools";
import { z } from "zod";
import { VTEXClient } from "../../lib/client.ts";
import type { Env } from "../../types/env.ts";

export const listSkusByProduct = (env: Env) =>
  createTool({
    id: "VTEX_LIST_SKUS_BY_PRODUCT",
    description: "List all SKUs for a specific product.",
    inputSchema: z.object({
      productId: z.number().describe("The product ID"),
    }),
    outputSchema: z.object({
      skus: z.array(
        z.object({
          Id: z.number().describe("SKU ID"),
          ProductId: z.number().describe("Product ID"),
          IsActive: z.boolean().describe("Whether SKU is active"),
          Name: z.string().describe("SKU name"),
          RefId: z.string().describe("Reference ID"),
          PackagedHeight: z.number().describe("Packaged height in cm"),
          PackagedLength: z.number().describe("Packaged length in cm"),
          PackagedWidth: z.number().describe("Packaged width in cm"),
          PackagedWeightKg: z.number().describe("Packaged weight in kg"),
          Height: z.number().describe("Product height in cm"),
          Length: z.number().describe("Product length in cm"),
          Width: z.number().describe("Product width in cm"),
          WeightKg: z.number().describe("Product weight in kg"),
          CubicWeight: z.number().describe("Cubic weight"),
          IsKit: z.boolean().describe("Whether SKU is a kit"),
          CreationDate: z.string().describe("Creation date"),
          MeasurementUnit: z.string().describe("Measurement unit"),
          UnitMultiplier: z.number().describe("Unit multiplier"),
        }),
      ),
    }),
    execute: async ({ context }) => {
      const credentials = env.MESH_REQUEST_CONTEXT.state;
      const client = new VTEXClient(credentials);
      const skus = await client.listSkusByProduct(context.productId);
      return { skus };
    },
  });
