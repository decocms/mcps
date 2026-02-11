import { createTool } from "@decocms/runtime/tools";
import { z } from "zod";
import { VTEXClient } from "../../lib/client.ts";
import type { Env } from "../../types/env.ts";

export const updateSku = (env: Env) =>
  createTool({
    id: "VTEX_UPDATE_SKU",
    description: "Update an existing SKU.",
    inputSchema: z.object({
      skuId: z.number().describe("SKU ID to update"),
      Name: z.string().optional().describe("SKU name"),
      IsActive: z.boolean().optional().describe("Whether SKU is active"),
      RefId: z.string().optional().describe("Reference ID"),
      PackagedHeight: z.number().optional().describe("Package height"),
      PackagedLength: z.number().optional().describe("Package length"),
      PackagedWidth: z.number().optional().describe("Package width"),
      PackagedWeightKg: z.number().optional().describe("Package weight"),
    }),
    execute: async ({ context }) => {
      const { skuId, ...data } = context;
      const credentials = env.DECO_CHAT_REQUEST_CONTEXT.state;
      const client = new VTEXClient(credentials);
      return client.updateSku(skuId, data);
    },
  });
