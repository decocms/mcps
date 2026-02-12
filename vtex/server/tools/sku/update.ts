import { createTool } from "@decocms/runtime/tools";
import { z } from "zod";
import { VTEXClient } from "../../lib/client.ts";
import type { Env } from "../../types/env.ts";

const outputSchema = z.object({
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
});

export const updateSku = (env: Env) =>
  createTool({
    id: "VTEX_UPDATE_SKU",
    description: "Update an existing SKU.",
    inputSchema: z.object({
      skuId: z.coerce.number().describe("SKU ID to update"),
      Name: z.string().optional().describe("SKU name"),
      IsActive: z.boolean().optional().describe("Whether SKU is active"),
      RefId: z.string().optional().describe("Reference ID"),
      PackagedHeight: z.number().optional().describe("Package height"),
      PackagedLength: z.number().optional().describe("Package length"),
      PackagedWidth: z.number().optional().describe("Package width"),
      PackagedWeightKg: z.number().optional().describe("Package weight"),
    }),
    outputSchema,
    execute: async ({ context }) => {
      const { skuId, ...data } = context;
      const credentials = env.MESH_REQUEST_CONTEXT.state;
      const client = new VTEXClient(credentials);
      const result = await client.updateSku(skuId, data);
      return outputSchema.parse(result);
    },
  });
