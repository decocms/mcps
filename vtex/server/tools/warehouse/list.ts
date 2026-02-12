import { createTool } from "@decocms/runtime/tools";
import { z } from "zod";
import { VTEXClient } from "../../lib/client.ts";
import type { Env } from "../../types/env.ts";

const outputSchema = z.array(
  z.object({
    id: z.string(),
    name: z.string(),
    warehouseDocks: z.array(
      z.object({
        dockId: z.string(),
        time: z.string(),
        cost: z.number(),
      }),
    ),
  }),
);

export const listWarehouses = (env: Env) =>
  createTool({
    id: "VTEX_LIST_WAREHOUSES",
    description: "List all warehouses configured in the account.",
    inputSchema: z.object({}),
    outputSchema,
    execute: async () => {
      const credentials = env.MESH_REQUEST_CONTEXT.state;
      const client = new VTEXClient(credentials);
      const result = await client.listWarehouses();
      return outputSchema.parse(result);
    },
  });
