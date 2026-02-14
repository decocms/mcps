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

export const getSku = (env: Env) =>
  createTool({
    id: "VTEX_GET_SKU",
    description: "Get SKU details by ID.",
    inputSchema: z.object({
      skuId: z.coerce.number().describe("The SKU ID"),
    }),
    outputSchema,
    execute: async ({ context }) => {
      const credentials = env.MESH_REQUEST_CONTEXT.state;
      const client = new VTEXClient(credentials);
      const result = await client.getSku(context.skuId);
      return outputSchema.parse(result);
    },
  });
