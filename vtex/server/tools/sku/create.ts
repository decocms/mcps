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

export const createSku = (env: Env) =>
  createTool({
    id: "VTEX_CREATE_SKU",
    description: "Create a new SKU for a product.",
    inputSchema: z.object({
      ProductId: z.coerce.number().describe("Product ID this SKU belongs to"),
      Name: z.string().describe("SKU name"),
      IsActive: z.boolean().describe("Whether SKU is active"),
      RefId: z.string().optional().describe("Reference ID"),
      PackagedHeight: z.number().optional().describe("Package height in cm"),
      PackagedLength: z.number().optional().describe("Package length in cm"),
      PackagedWidth: z.number().optional().describe("Package width in cm"),
      PackagedWeightKg: z.number().optional().describe("Package weight in kg"),
      MeasurementUnit: z
        .string()
        .optional()
        .describe("Measurement unit (un, kg, etc)"),
      UnitMultiplier: z.number().optional().describe("Unit multiplier"),
    }),
    outputSchema,
    execute: async ({ context }) => {
      const credentials = env.MESH_REQUEST_CONTEXT.state;
      const client = new VTEXClient(credentials);
      const result = await client.createSku(context);
      return outputSchema.parse(result);
    },
  });
