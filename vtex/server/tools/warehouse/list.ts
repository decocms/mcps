import { createTool } from "@decocms/runtime/tools";
import { z } from "zod";
import { VTEXClient } from "../../lib/client.ts";
import type { Env } from "../../types/env.ts";

export const listWarehouses = (env: Env) =>
  createTool({
    id: "VTEX_LIST_WAREHOUSES",
    description: "List all warehouses configured in the account.",
    inputSchema: z.object({}),
    execute: async () => {
      const credentials = env.DECO_CHAT_REQUEST_CONTEXT.state;
      const client = new VTEXClient(credentials);
      return client.listWarehouses();
    },
  });
