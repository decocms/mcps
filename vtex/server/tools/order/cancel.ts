import { createTool } from "@decocms/runtime/tools";
import { z } from "zod";
import { VTEXClient, getCredentials } from "../../lib/client.ts";
import type { Env } from "../../types/env.ts";

export const cancelOrder = (env: Env) =>
  createTool({
    id: "VTEX_CANCEL_ORDER",
    description:
      "Cancel an order. Only works for orders that haven't been invoiced yet.",
    inputSchema: z.object({
      orderId: z.string().describe("The order ID to cancel"),
    }),
    execute: async ({ context }) => {
      const client = new VTEXClient(getCredentials(env));
      return client.cancelOrder(context.orderId);
    },
  });
