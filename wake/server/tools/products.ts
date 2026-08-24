/**
 * Product discovery tools — search, listing, detail, autocomplete and
 * recommendations against the Wake Storefront GraphQL API.
 */
import { z } from "zod";
import { createWakeTool } from "../lib/tool.ts";
import {
  AUTOCOMPLETE,
  GET_PRODUCT,
  LIST_PRODUCTS,
  PRODUCT_RECOMMENDATIONS,
  SEARCH_PRODUCTS,
} from "../lib/queries.ts";

const PRODUCT_SORT_KEYS = [
  "NAME",
  "SALES",
  "PRICE",
  "DISCOUNT",
  "RANDOM",
  "RELEASE_DATE",
  "STOCK",
] as const;

const SEARCH_SORT_KEYS = ["RELEVANCE", ...PRODUCT_SORT_KEYS] as const;

/** [ProductFilterInput] — facet filters returned by search/hotsite aggregations. */
const facetFilter = z
  .array(
    z.object({
      field: z
        .string()
        .describe("Filter field, e.g. an aggregation field name"),
      values: z.array(z.string()).describe("Selected values for this field"),
    }),
  )
  .optional()
  .describe(
    "Facet filters. Use the `aggregations.filters` returned by a previous search/hotsite call to discover valid field/value pairs.",
  );

export const searchProductsTool = createWakeTool({
  id: "WAKE_SEARCH_PRODUCTS",
  description:
    "Full-text search over the Wake storefront catalog. Returns matching products plus aggregations (facets, price ranges) and breadcrumbs. Use the returned aggregations to drive faceted filtering on a follow-up call.",
  inputSchema: z.object({
    query: z.string().optional().describe("Search term. Omit to browse."),
    operation: z
      .enum(["AND", "OR"])
      .default("AND")
      .describe("How multiple query terms are combined"),
    limit: z.coerce
      .number()
      .int()
      .min(1)
      .max(50)
      .default(24)
      .describe("Number of products to return (max 50)"),
    offset: z.coerce
      .number()
      .int()
      .min(0)
      .default(0)
      .describe("Pagination offset (number of products to skip)"),
    minimumPrice: z.coerce.number().optional().describe("Minimum price filter"),
    maximumPrice: z.coerce.number().optional().describe("Maximum price filter"),
    onlyMainVariant: z
      .boolean()
      .optional()
      .describe("Return only each product's main variant"),
    sortDirection: z.enum(["ASC", "DESC"]).optional(),
    sortKey: z.enum(SEARCH_SORT_KEYS).optional(),
    filters: facetFilter,
  }),
  handler: async (input, client) => {
    const data = await client.query(SEARCH_PRODUCTS, input);
    return data as Record<string, unknown>;
  },
});

export const listProductsTool = createWakeTool({
  id: "WAKE_LIST_PRODUCTS",
  description:
    "List catalog products using explicit filters (by id, sku, ean, category, brand, availability, price, attributes). Cursor-paginated. Prefer this over search when you already know the identifiers or want structured filtering.",
  inputSchema: z.object({
    filters: z
      .object({
        productId: z.array(z.coerce.number().int()).optional(),
        productVariantId: z.array(z.coerce.number().int()).optional(),
        parentId: z.array(z.coerce.number().int()).optional(),
        sku: z.array(z.string()).optional(),
        ean: z.array(z.string()).optional(),
        categoryId: z.array(z.coerce.number().int()).optional(),
        brandId: z.array(z.coerce.number().int()).optional(),
        search: z.array(z.string()).optional(),
        available: z.boolean().optional(),
        mainVariant: z.boolean().optional(),
        hasImages: z.boolean().optional(),
        stock_gte: z.coerce.number().int().optional(),
        stock_lte: z.coerce.number().int().optional(),
        prices: z
          .object({
            price_gte: z.coerce.number().optional(),
            price_lte: z.coerce.number().optional(),
            discount_gte: z.coerce.number().optional(),
            discount_lte: z.coerce.number().optional(),
            discounted: z.boolean().optional(),
          })
          .optional(),
        attributes: z
          .object({
            id: z.array(z.coerce.number().int()).optional(),
            name: z.array(z.string()).optional(),
            type: z.array(z.string()).optional(),
            value: z.array(z.string()).optional(),
          })
          .optional(),
      })
      .default({})
      .describe("Explicit product filters (ProductExplicitFiltersInput)"),
    first: z.coerce
      .number()
      .int()
      .min(1)
      .max(50)
      .default(24)
      .describe("Number of products to return (max 50)"),
    sortDirection: z.enum(["ASC", "DESC"]).default("ASC"),
    sortKey: z.enum(PRODUCT_SORT_KEYS).default("NAME"),
    after: z
      .string()
      .optional()
      .describe("Cursor from a previous response's pageInfo.endCursor"),
  }),
  handler: async (input, client) => {
    const data = await client.query(LIST_PRODUCTS, input);
    return data as Record<string, unknown>;
  },
});

export const getProductTool = createWakeTool({
  id: "WAKE_GET_PRODUCT",
  description:
    "Fetch a single product with full detail: variants, attribute selections (variant matrix), prices, reviews, SEO and breadcrumbs.",
  inputSchema: z.object({
    productId: z.coerce.number().int().describe("Wake product id"),
    includeParentIdVariants: z
      .boolean()
      .optional()
      .describe("Include variants that share the same parent id"),
  }),
  handler: async (input, client) => {
    const data = await client.query(GET_PRODUCT, input);
    return data as Record<string, unknown>;
  },
});

export const autocompleteTool = createWakeTool({
  id: "WAKE_AUTOCOMPLETE",
  description:
    "Search-as-you-type suggestions plus a short list of matching products. Ideal for building a search box preview.",
  inputSchema: z.object({
    query: z.string().describe("Partial search term"),
    limit: z.coerce
      .number()
      .int()
      .min(1)
      .max(50)
      .default(10)
      .describe("Max products to return (max 50)"),
  }),
  handler: async (input, client) => {
    const data = await client.query(AUTOCOMPLETE, input);
    return data as Record<string, unknown>;
  },
});

export const productRecommendationsTool = createWakeTool({
  id: "WAKE_PRODUCT_RECOMMENDATIONS",
  description:
    "Get products recommended for a given product (e.g. cross-sell / related items).",
  inputSchema: z.object({
    productId: z.coerce.number().int().describe("Reference product id"),
    quantity: z.coerce
      .number()
      .int()
      .min(1)
      .max(50)
      .default(10)
      .describe("Number of recommendations to return (max 50)"),
    algorithm: z
      .enum(["DEFAULT"])
      .default("DEFAULT")
      .describe("Recommendation algorithm"),
  }),
  handler: async (input, client) => {
    const data = await client.query(PRODUCT_RECOMMENDATIONS, input);
    return data as Record<string, unknown>;
  },
});

export const productTools = [
  searchProductsTool,
  listProductsTool,
  getProductTool,
  autocompleteTool,
  productRecommendationsTool,
];
