import { createTool } from "@decocms/runtime/tools";
import { z } from "zod";
import { VTEXClient } from "../../lib/client.ts";
import type { Env } from "../../types/env.ts";

const outputSchema = z.object({
  id: z.string(),
  name: z.string(),
  warehouseDocks: z.array(
    z.object({
      dockId: z.string(),
      time: z.string(),
      cost: z.number(),
    }),
  ),
});

export const getWarehouse = (env: Env) =>
  createTool({
    id: "VTEX_GET_WAREHOUSE",
    description: "Get warehouse details by ID.",
    inputSchema: z.object({
      warehouseId: z.string().describe("The warehouse ID"),
    }),
    outputSchema,
    execute: async ({ context }) => {
      const credentials = env.MESH_REQUEST_CONTEXT.state;
      const client = new VTEXClient(credentials);
      const result = await client.getWarehouse(context.warehouseId);
      return outputSchema.parse(result);
    },
  });
