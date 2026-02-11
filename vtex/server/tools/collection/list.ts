import { createTool } from "@decocms/runtime/tools";
import { z } from "zod";
import { VTEXClient } from "../../lib/client.ts";
import type { Env } from "../../types/env.ts";

export const listCollections = (env: Env) =>
  createTool({
    id: "VTEX_LIST_COLLECTIONS",
    description:
      "List all collections in the catalog. Collections are groups of SKUs that can be displayed together on product pages.",
    inputSchema: z.object({
      page: z.number().optional().describe("Page number (starts at 1)"),
      pageSize: z.number().optional().describe("Number of items per page"),
    }),
    execute: async ({ context }) => {
      const credentials = env.DECO_CHAT_REQUEST_CONTEXT.state;
      const client = new VTEXClient(credentials);
      return client.listCollections(context);
    },
  });

export const searchCollections = (env: Env) =>
  createTool({
    id: "VTEX_SEARCH_COLLECTIONS",
    description: "Search collections by name or other terms.",
    inputSchema: z.object({
      searchTerms: z.string().describe("Search terms to find collections"),
    }),
    execute: async ({ context }) => {
      const credentials = env.DECO_CHAT_REQUEST_CONTEXT.state;
      const client = new VTEXClient(credentials);
      return client.searchCollections(context.searchTerms);
    },
  });
