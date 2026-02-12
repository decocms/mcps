import { createTool } from "@decocms/runtime/tools";
import { z } from "zod";
import { VTEXClient } from "../../lib/client.ts";
import type { Env } from "../../types/env.ts";

export const getOrder = (env: Env) =>
  createTool({
    id: "VTEX_GET_ORDER",
    description:
      "Get a specific VTEX order by ID with complete details including items, payment, shipping, customer information, and order status",
    inputSchema: z.object({
      orderId: z.string().describe("The unique order identifier to retrieve"),
    }),
    execute: async ({ context }) => {
      const credentials = env.MESH_REQUEST_CONTEXT.state;
      const client = new VTEXClient(credentials);
      return client.getOrder(context.orderId);
    },
  });
