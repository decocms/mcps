import { createTool } from "@decocms/runtime/tools";
import { z } from "zod";
import { VTEXClient } from "../../lib/client.ts";
import type { Env } from "../../types/env.ts";

const outputSchema = z.object({
  id: z.number(),
  name: z.string(),
  isActive: z.boolean(),
  title: z.string().nullable(),
  metaTagDescription: z.string().nullable(),
  imageUrl: z.string().nullable(),
});

export const getBrand = (env: Env) =>
  createTool({
    id: "VTEX_GET_BRAND",
    description: "Get brand details by ID.",
    inputSchema: z.object({
      brandId: z.coerce.number().describe("The brand ID"),
    }),
    outputSchema,
    execute: async ({ context }) => {
      const credentials = env.MESH_REQUEST_CONTEXT.state;
      const client = new VTEXClient(credentials);
      const result = await client.getBrand(context.brandId);
      return outputSchema.parse(result);
    },
  });
