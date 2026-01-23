import { createTool } from "@decocms/runtime/tools";
import { z } from "zod";
import { VTEXClient, getCredentials } from "../../lib/client.ts";
import type { Env } from "../../types/env.ts";

export const listProducts = (env: Env) =>
  createTool({
    id: "VTEX_LIST_PRODUCTS",
    description:
      "List product and SKU IDs with pagination. Use from and to for pagination (max 250 records per request).",
    inputSchema: z.object({
      from: z.number().optional().describe("Start index (default: 1)"),
      to: z.number().optional().describe("End index (default: 250, max: 250)"),
    }),
    execute: async ({ context }) => {
      const client = new VTEXClient(getCredentials(env));
      return client.listProductIds(context.from, context.to);
    },
  });
