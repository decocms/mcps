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

export const updateCollection = (env: Env) =>
  createTool({
    id: "VTEX_UPDATE_COLLECTION",
    description: "Update an existing collection.",
    inputSchema: z.object({
      collectionId: z.coerce.number().describe("The collection ID to update"),
      Name: z.string().optional().describe("Collection name"),
      Description: z
        .string()
        .optional()
        .describe("Collection description for internal use"),
      Searchable: z
        .boolean()
        .optional()
        .describe("Whether the collection is searchable in the store"),
      Highlight: z
        .boolean()
        .optional()
        .describe("Whether to highlight specific products using a tag"),
      DateFrom: z
        .string()
        .optional()
        .describe("Collection start date and time (ISO 8601 format)"),
      DateTo: z
        .string()
        .optional()
        .describe("Collection end date and time (ISO 8601 format)"),
    }),
    outputSchema,
    execute: async ({ context }) => {
      const { collectionId, ...data } = context;
      const credentials = env.MESH_REQUEST_CONTEXT.state;
      const client = new VTEXClient(credentials);
      const result = await client.updateCollection(collectionId, data);
      return outputSchema.parse(result);
    },
  });
