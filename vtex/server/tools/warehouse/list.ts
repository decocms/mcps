import { createTool } from "@decocms/runtime/tools";
import { z } from "zod";
import { VTEXClient } from "../../lib/client.ts";
import type { Env } from "../../types/env.ts";

export const listWarehouses = (env: Env) =>
  createTool({
    id: "VTEX_LIST_WAREHOUSES",
    description: "List all warehouses configured in the account.",
    inputSchema: z.object({}),
    outputSchema: z
      .object({
        warehouses: z.array(
          z
            .object({
              id: z.string().describe("Warehouse ID"),
              name: z.string().describe("Warehouse name"),
              warehouseDocks: z
                .array(
                  z
                    .object({
                      dockId: z.string().describe("Dock ID"),
                      time: z.string().describe("Processing time"),
                      cost: z.number().describe("Cost in cents"),
                    })
                    .passthrough(),
                )
                .describe("Associated docks"),
            })
            .passthrough(),
        ),
      })
      .passthrough(),
    execute: async () => {
      const credentials = env.MESH_REQUEST_CONTEXT.state;
      const client = new VTEXClient(credentials);
      const warehouses = await client.listWarehouses();
      return { warehouses };
    },
  });
