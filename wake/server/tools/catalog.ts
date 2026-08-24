/**
 * Catalog navigation tools — hotsites (category / landing pages), variant
 * options and buy lists (kits).
 */
import { z } from "zod";
import { createWakeTool } from "../lib/tool.ts";
import { BUY_LIST_QUERY, HOTSITE, PRODUCT_OPTIONS } from "../lib/queries.ts";

const PRODUCT_SORT_KEYS = [
  "NAME",
  "SALES",
  "PRICE",
  "DISCOUNT",
  "RANDOM",
  "RELEASE_DATE",
  "STOCK",
] as const;

export const getHotsiteTool = createWakeTool({
  id: "WAKE_GET_HOTSITE",
  description:
    "Resolve a hotsite (category, collection or landing page) by URL path or hotsite id, returning its products, aggregations, breadcrumbs and SEO metadata. Use this to render category listing pages.",
  inputSchema: z.object({
    url: z
      .string()
      .optional()
      .describe(
        'Hotsite URL path, e.g. "/masculino" or a full storefront path',
      ),
    hotsiteId: z.coerce
      .number()
      .int()
      .optional()
      .describe("Hotsite id (alternative to url)"),
    limit: z.coerce.number().int().min(1).max(50).default(24),
    offset: z.coerce.number().int().min(0).default(0),
    minimumPrice: z.coerce.number().optional(),
    maximumPrice: z.coerce.number().optional(),
    onlyMainVariant: z.boolean().optional(),
    sortDirection: z.enum(["ASC", "DESC"]).optional(),
    sortKey: z.enum(PRODUCT_SORT_KEYS).optional(),
    filters: z
      .array(
        z.object({
          field: z.string(),
          values: z.array(z.string()),
        }),
      )
      .optional()
      .describe("Facet filters from a previous aggregations response"),
  }),
  handler: async (input, client) => {
    const data = await client.query(HOTSITE, input);
    return data as Record<string, unknown>;
  },
});

export const productOptionsTool = createWakeTool({
  id: "WAKE_PRODUCT_OPTIONS",
  description:
    "List the selectable attributes (e.g. color, size) and their variants for a product. Use to build variant selectors.",
  inputSchema: z.object({
    productId: z.coerce.number().int().describe("Wake product id"),
  }),
  handler: async (input, client) => {
    const data = await client.query(PRODUCT_OPTIONS, input);
    return data as Record<string, unknown>;
  },
});

export const getBuyListTool = createWakeTool({
  id: "WAKE_GET_BUYLIST",
  description:
    "Fetch a buy list (kit / combo) by id, including its component products and pricing.",
  inputSchema: z.object({
    id: z.coerce.number().int().describe("Buy list id"),
  }),
  handler: async (input, client) => {
    const data = await client.query(BUY_LIST_QUERY, input);
    return data as Record<string, unknown>;
  },
});

export const catalogTools = [
  getHotsiteTool,
  productOptionsTool,
  getBuyListTool,
];
