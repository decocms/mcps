import { createTool } from "@decocms/runtime/tools";
import { z } from "zod";
import { VTEXClient } from "../../lib/client.ts";
import type { Env } from "../../types/env.ts";

const collectionListOutputSchema = z.object({
  paging: z.object({
    page: z.number(),
    perPage: z.number(),
    total: z.number(),
    pages: z.number(),
  }),
  items: z.array(
    z.object({
      id: z.number(),
      name: z.string(),
      searchable: z.boolean(),
      highlight: z.boolean(),
      dateFrom: z.string(),
      dateTo: z.string(),
      totalSku: z.number(),
      totalProducts: z.number(),
      type: z.enum(["Manual", "Automatic", "Hybrid"]),
      lastModifiedBy: z.string().nullable(),
    }),
  ),
});

export const listCollections = (env: Env) =>
  createTool({
    id: "VTEX_LIST_COLLECTIONS",
    description:
      "List all collections in the catalog. Collections are groups of SKUs that can be displayed together on product pages.",
    inputSchema: z.object({
      page: z.coerce.number().optional().describe("Page number (starts at 1)"),
      pageSize: z.coerce
        .number()
        .optional()
        .describe("Number of items per page"),
    }),
    outputSchema: collectionListOutputSchema,
    execute: async ({ context }) => {
      const credentials = env.MESH_REQUEST_CONTEXT.state;
      const client = new VTEXClient(credentials);
      const result = await client.listCollections(context);
      return collectionListOutputSchema.parse(result);
    },
  });

export const searchCollections = (env: Env) =>
  createTool({
    id: "VTEX_SEARCH_COLLECTIONS",
    description: "Search collections by name or other terms.",
    inputSchema: z.object({
      searchTerms: z.string().describe("Search terms to find collections"),
    }),
    outputSchema: collectionListOutputSchema,
    execute: async ({ context }) => {
      const credentials = env.MESH_REQUEST_CONTEXT.state;
      const client = new VTEXClient(credentials);
      const result = await client.searchCollections(context.searchTerms);
      return collectionListOutputSchema.parse(result);
    },
  });
