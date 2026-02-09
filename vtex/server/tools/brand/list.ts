import { createTool } from "@decocms/runtime/tools";
import { z } from "zod";
import { VTEXClient, getCredentials } from "../../lib/client.ts";
import type { Env } from "../../types/env.ts";

export const listBrands = (env: Env) =>
  createTool({
    id: "VTEX_LIST_BRANDS",
    description: "List all brands in the catalog.",
    inputSchema: z.object({}),
    execute: async () => {
      const client = new VTEXClient(getCredentials(env));
      return client.listBrands();
    },
  });
