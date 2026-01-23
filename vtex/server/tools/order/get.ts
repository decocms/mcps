import { createTool } from "@decocms/runtime/tools";
import { z } from "zod";
import { VTEXClient, getCredentials } from "../../lib/client.ts";
import type { Env } from "../../types/env.ts";

export const getOrder = (env: Env) =>
  createTool({
    id: "VTEX_GET_ORDER",
    description:
      "Get order details by order ID. Returns full order information including items, shipping, payment, and status.",
    inputSchema: z.object({
      orderId: z.string().describe("The order ID"),
    }),
    execute: async ({ context }) => {
      const client = new VTEXClient(getCredentials(env));
      return client.getOrder(context.orderId);
    },
  });
