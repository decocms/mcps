import { createTool } from "@decocms/runtime/tools";
import { z } from "zod";
import { VTEXClient } from "../../lib/client.ts";
import type { Env } from "../../types/env.ts";

export const listPriceTables = (env: Env) =>
  createTool({
    id: "VTEX_LIST_PRICE_TABLES",
    description:
      "List all price tables available in the store. Price tables are used to define different pricing contexts like trade policies, B2B pricing, or regional pricing.",
    inputSchema: z.object({}),
    outputSchema: z
      .object({
        priceTables: z.array(
          z
            .object({
              id: z.string().describe("Price table ID (trade policy ID)"),
              name: z.string().describe("Price table name"),
            })
            .passthrough(),
        ),
      })
      .passthrough(),
    execute: async () => {
      const credentials = env.MESH_REQUEST_CONTEXT.state;
      const client = new VTEXClient(credentials);
      const priceTables = await client.listPriceTables();
      return { priceTables };
    },
  });
