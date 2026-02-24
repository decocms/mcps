import { createTool } from "@decocms/runtime/tools";
import { z } from "zod";
import type { Env } from "../../types/env.ts";

const collectionListOutputSchema = z
  .object({
    paging: z
      .object({
        page: z.number(),
        perPage: z.number(),
        total: z.number(),
        pages: z.number(),
      })
      .passthrough(),
    items: z.array(
      z
        .object({
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
        })
        .passthrough(),
    ),
  })
  .passthrough();

export const searchCollections = (env: Env) =>
  createTool({
    id: "VTEX_SEARCH_COLLECTIONS",
    description: "Search collections by name or other terms.",
    annotations: { readOnlyHint: true },
    inputSchema: z.object({
      searchTerms: z.string().describe("Search terms to find collections"),
    }),
    outputSchema: collectionListOutputSchema,
    execute: async ({ context }) => {
      const credentials = env.MESH_REQUEST_CONTEXT.state;
      const { accountName, appKey, appToken } = credentials;

      const url = `https://${accountName}.vtexcommercestable.com.br/api/catalog_system/pvt/collection/search/${encodeURIComponent(context.searchTerms)}`;

      const response = await fetch(url, {
        headers: {
          Accept: "application/json",
          "Content-Type": "application/json",
          ...(appKey && { "X-VTEX-API-AppKey": appKey }),
          ...(appToken && { "X-VTEX-API-AppToken": appToken }),
        },
      });

      if (!response.ok) {
        throw new Error(
          `VTEX API Error: ${response.status} - ${await response.text()}`,
        );
      }

      const result: unknown = await response.json();
      return collectionListOutputSchema.parse(result);
    },
  });
