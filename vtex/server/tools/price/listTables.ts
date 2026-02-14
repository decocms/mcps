import { createTool } from "@decocms/runtime/tools";
import { z } from "zod";
import { VTEXClient } from "../../lib/client.ts";
import type { Env } from "../../types/env.ts";

const outputSchema = z.array(
  z.object({
    id: z.string(),
    name: z.string(),
  }),
);

export const listPriceTables = (env: Env) =>
  createTool({
    id: "VTEX_LIST_PRICE_TABLES",
    description:
      "List all price tables available in the store. Price tables are used to define different pricing contexts like trade policies, B2B pricing, or regional pricing.",
    inputSchema: z.object({}),
    outputSchema,
    execute: async () => {
      const credentials = env.MESH_REQUEST_CONTEXT.state;
      const client = new VTEXClient(credentials);
      const result = await client.listPriceTables();
      return outputSchema.parse(result);
    },
  });
