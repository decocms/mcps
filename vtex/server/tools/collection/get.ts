import { createTool } from "@decocms/runtime/tools";
import { z } from "zod";
import { VTEXClient } from "../../lib/client.ts";
import type { Env } from "../../types/env.ts";

const outputSchema = z.object({
  Id: z.number(),
  Name: z.string(),
  Description: z.string(),
  Searchable: z.boolean(),
  Highlight: z.boolean(),
  DateFrom: z.string(),
  DateTo: z.string(),
  TotalProducts: z.number(),
  Type: z.enum(["Manual", "Automatic", "Hybrid"]),
});

export const getCollection = (env: Env) =>
  createTool({
    id: "VTEX_GET_COLLECTION",
    description: "Get details of a specific collection by ID.",
    inputSchema: z.object({
      collectionId: z.coerce.number().describe("The collection ID"),
    }),
    outputSchema,
    execute: async ({ context }) => {
      const credentials = env.MESH_REQUEST_CONTEXT.state;
      const client = new VTEXClient(credentials);
      const result = await client.getCollection(context.collectionId);
      return outputSchema.parse(result);
    },
  });
