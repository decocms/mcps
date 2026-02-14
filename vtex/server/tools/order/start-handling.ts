import { createTool } from "@decocms/runtime/tools";
import { z } from "zod";
import { VTEXClient } from "../../lib/client.ts";
import type { Env } from "../../types/env.ts";

const outputSchema = z.object({
  date: z.string(),
  orderId: z.string(),
});

export const startHandling = (env: Env) =>
  createTool({
    id: "VTEX_START_HANDLING",
    description:
      "Start handling an order. Changes order status to indicate it's being processed.",
    inputSchema: z.object({
      orderId: z.string().describe("The order ID to start handling"),
    }),
    outputSchema,
    execute: async ({ context }) => {
      const credentials = env.MESH_REQUEST_CONTEXT.state;
      const client = new VTEXClient(credentials);
      const result = await client.startHandling(context.orderId);
      return outputSchema.parse(result);
    },
  });
