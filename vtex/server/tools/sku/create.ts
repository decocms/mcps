import { createTool } from "@decocms/runtime/tools";
import { z } from "zod";
import { VTEXClient } from "../../lib/client.ts";
import type { Env } from "../../types/env.ts";

export const createSku = (env: Env) =>
  createTool({
    id: "VTEX_CREATE_SKU",
    description: "Create a new SKU for a product.",
    inputSchema: z.object({
      ProductId: z.number().describe("Product ID this SKU belongs to"),
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
    execute: async ({ context }) => {
      const credentials = env.DECO_CHAT_REQUEST_CONTEXT.state;
      const client = new VTEXClient(credentials);
      return client.createSku(context);
    },
  });
