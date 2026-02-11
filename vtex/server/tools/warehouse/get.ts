import { createTool } from "@decocms/runtime/tools";
import { z } from "zod";
import { VTEXClient } from "../../lib/client.ts";
import type { Env } from "../../types/env.ts";

export const getWarehouse = (env: Env) =>
  createTool({
    id: "VTEX_GET_WAREHOUSE",
    description: "Get warehouse details by ID.",
    inputSchema: z.object({
      warehouseId: z.string().describe("The warehouse ID"),
    }),
    execute: async ({ context }) => {
      const credentials = env.MESH_REQUEST_CONTEXT.state;
      const client = new VTEXClient(credentials);
      return client.getWarehouse(context.warehouseId);
    },
  });
