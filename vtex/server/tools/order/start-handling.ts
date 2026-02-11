import { createTool } from "@decocms/runtime/tools";
import { z } from "zod";
import { VTEXClient } from "../../lib/client.ts";
import type { Env } from "../../types/env.ts";

export const startHandling = (env: Env) =>
  createTool({
    id: "VTEX_START_HANDLING",
    description:
      "Start handling an order. Changes order status to indicate it's being processed.",
    inputSchema: z.object({
      orderId: z.string().describe("The order ID to start handling"),
    }),
    execute: async ({ context }) => {
      const credentials = env.MESH_REQUEST_CONTEXT.state;
      const client = new VTEXClient(credentials);
      return client.startHandling(context.orderId);
    },
  });
