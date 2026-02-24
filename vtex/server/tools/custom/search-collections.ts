import { createTool } from "@decocms/runtime/tools";
import { z } from "zod";
import type { Env } from "../../types/env.ts";

export const searchCollections = (env: Env) =>
  createTool({
    id: "VTEX_SEARCH_COLLECTIONS",
    description: "Search collections by name or other terms.",
    annotations: { readOnlyHint: true },
    inputSchema: z.object({
      searchTerms: z.string().describe("Search terms to find collections"),
    }),
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

      return response.json();
    },
  });
