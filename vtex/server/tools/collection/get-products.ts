import { createTool } from "@decocms/runtime/tools";
import { z } from "zod";
import { VTEXClient } from "../../lib/client.ts";
import type { Env } from "../../types/env.ts";

export const getCollectionProducts = (env: Env) =>
  createTool({
    id: "VTEX_GET_COLLECTION_PRODUCTS",
    description: "Get all products/SKUs from a specific collection.",
    inputSchema: z.object({
      collectionId: z.number().describe("The collection ID"),
      page: z.number().optional().describe("Page number"),
      pageSize: z.number().optional().describe("Number of items per page"),
    }),
    execute: async ({ context }) => {
      const { collectionId, ...params } = context;
      const credentials = env.DECO_CHAT_REQUEST_CONTEXT.state;
      const client = new VTEXClient(credentials);
      return client.getCollectionProducts(collectionId, params);
    },
  });
