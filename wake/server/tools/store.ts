/**
 * Store-level tools — shop metadata, URL resolution and shipping quotes.
 */
import { z } from "zod";
import { createWakeTool } from "../lib/tool.ts";
import { RESOLVE_URL, SHIPPING_QUOTES, SHOP } from "../lib/queries.ts";

export const shopInfoTool = createWakeTool({
  id: "WAKE_SHOP_INFO",
  description:
    "Get storefront metadata: name, main URL and checkout URLs (desktop and mobile).",
  inputSchema: z.object({}),
  handler: async (_input, client) => {
    const data = await client.query(SHOP);
    return data as Record<string, unknown>;
  },
});

export const resolveUrlTool = createWakeTool({
  id: "WAKE_RESOLVE_URL",
  description:
    "Resolve a storefront URL path to its route kind (product, hotsite/category, redirect, etc.). Use this to decide which other tool to call for a given path.",
  inputSchema: z.object({
    url: z
      .string()
      .describe('Storefront URL path, e.g. "/some-product" or "/masculino"'),
  }),
  handler: async (input, client) => {
    const data = await client.query(RESOLVE_URL, input);
    return data as Record<string, unknown>;
  },
});

export const shippingQuotesTool = createWakeTool({
  id: "WAKE_SHIPPING_QUOTES",
  description:
    "Estimate shipping options (price, deadline, delivery schedules) for a product variant to a postal code (CEP), or for an existing checkout.",
  inputSchema: z.object({
    cep: z
      .string()
      .optional()
      .describe('Destination postal code (Brazilian CEP), e.g. "01310-100"'),
    productVariantId: z.coerce
      .number()
      .int()
      .optional()
      .describe("Product variant id to quote"),
    quantity: z.coerce
      .number()
      .int()
      .min(1)
      .default(1)
      .describe("Item quantity"),
    checkoutId: z
      .string()
      .optional()
      .describe(
        "Existing checkout id (UUID) to quote instead of a single variant",
      ),
    useSelectedAddress: z
      .boolean()
      .optional()
      .describe("Use the customer's selected address instead of a raw CEP"),
  }),
  handler: async (input, client) => {
    const data = await client.query(SHIPPING_QUOTES, input);
    return data as Record<string, unknown>;
  },
});

export const storeTools = [shopInfoTool, resolveUrlTool, shippingQuotesTool];
