import { createTool } from "@decocms/runtime/tools";
import { z } from "zod";
import { VTEXClient } from "../../lib/client.ts";
import type { Env } from "../../types/env.ts";

const outputSchema = z.object({
  orderId: z.string(),
  sequence: z.string(),
  status: z.string(),
  statusDescription: z.string(),
  value: z.number(),
  creationDate: z.string(),
  lastChange: z.string(),
  totals: z.array(
    z.object({
      id: z.string(),
      name: z.string(),
      value: z.number(),
    }),
  ),
  items: z.array(
    z.object({
      id: z.string(),
      productId: z.string(),
      name: z.string(),
      quantity: z.number(),
      price: z.number(),
      sellingPrice: z.number(),
      imageUrl: z.string(),
    }),
  ),
  clientProfileData: z.object({
    email: z.string(),
    firstName: z.string(),
    lastName: z.string(),
    phone: z.string(),
  }),
  shippingData: z.object({
    address: z.object({
      postalCode: z.string(),
      city: z.string(),
      state: z.string(),
      country: z.string(),
      street: z.string(),
      number: z.string(),
      neighborhood: z.string(),
    }),
  }),
});

export const getOrder = (env: Env) =>
  createTool({
    id: "VTEX_GET_ORDER",
    description:
      "Get a specific VTEX order by ID with complete details including items, payment, shipping, customer information, and order status",
    inputSchema: z.object({
      orderId: z.string().describe("The unique order identifier to retrieve"),
    }),
    outputSchema,
    execute: async ({ context }) => {
      const credentials = env.MESH_REQUEST_CONTEXT.state;
      const client = new VTEXClient(credentials);
      const result = await client.getOrder(context.orderId);
      return outputSchema.parse(result);
    },
  });
