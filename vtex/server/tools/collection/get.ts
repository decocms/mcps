import { createTool } from "@decocms/runtime/tools";
import { z } from "zod";
import { VTEXClient } from "../../lib/client.ts";
import type { Env } from "../../types/env.ts";

export const getCollection = (env: Env) =>
  createTool({
    id: "VTEX_GET_COLLECTION",
    description: "Get details of a specific collection by ID.",
    inputSchema: z.object({
      collectionId: z.number().describe("The collection ID"),
    }),
    execute: async ({ context }) => {
      const credentials = env.MESH_REQUEST_CONTEXT.state;
      const client = new VTEXClient(credentials);
      return client.getCollection(context.collectionId);
    },
  });
