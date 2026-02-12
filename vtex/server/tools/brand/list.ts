import { createTool } from "@decocms/runtime/tools";
import { z } from "zod";
import { VTEXClient } from "../../lib/client.ts";
import type { Env } from "../../types/env.ts";

const outputSchema = z.array(
  z.object({
    id: z.number(),
    name: z.string(),
    isActive: z.boolean(),
    title: z.string().nullable(),
    metaTagDescription: z.string().nullable(),
    imageUrl: z.string().nullable(),
  }),
);

export const listBrands = (env: Env) =>
  createTool({
    id: "VTEX_LIST_BRANDS",
    description: "List all brands in the catalog.",
    inputSchema: z.object({}),
    outputSchema,
    execute: async () => {
      const credentials = env.MESH_REQUEST_CONTEXT.state;
      const client = new VTEXClient(credentials);
      const result = await client.listBrands();
      return outputSchema.parse(result);
    },
  });
