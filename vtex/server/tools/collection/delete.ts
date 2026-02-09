import { createTool } from "@decocms/runtime/tools";
import { z } from "zod";
import { VTEXClient, getCredentials } from "../../lib/client.ts";
import type { Env } from "../../types/env.ts";

export const deleteCollection = (env: Env) =>
  createTool({
    id: "VTEX_DELETE_COLLECTION",
    description: "Delete a collection by ID.",
    inputSchema: z.object({
      collectionId: z.number().describe("The collection ID to delete"),
    }),
    execute: async ({ context }) => {
      const client = new VTEXClient(getCredentials(env));
      await client.deleteCollection(context.collectionId);
      return { success: true, message: "Collection deleted successfully" };
    },
  });
