/**
 * Curated generic Magento REST tools (read-only in v1).
 *
 * Hand-written instead of OpenAPI-generated: Magento's swagger declares
 * searchCriteria as bracket-indexed literal query params, which produce
 * unusable generated schemas. Tools expose a clean `filters` array translated
 * by lib/search-criteria.ts.
 */
import { createTool } from "@decocms/runtime/tools";
import { z } from "zod";
import {
  assertValidCredentials,
  magentoFetch,
  resolveCredentials,
} from "../lib/client.ts";
import {
  buildSearchCriteriaParams,
  filtersSchema,
} from "../lib/search-criteria.ts";
import type { Env } from "../types/env.ts";

/** Normalize API payloads so tool results are always objects. */
function toStructured(data: unknown): Record<string, unknown> {
  if (Array.isArray(data)) return { items: data };
  if (data !== null && typeof data === "object") {
    return data as Record<string, unknown>;
  }
  return { result: data };
}

// ── Search-endpoint factory ──────────────────────────────────────────────────

const searchInputSchema = z.object({
  filters: filtersSchema,
  pageSize: z
    .number()
    .int()
    .min(1)
    .max(500)
    .optional()
    .describe("Results per page (default 20)"),
  currentPage: z
    .number()
    .int()
    .min(1)
    .optional()
    .describe("Page number, 1-based"),
  sortField: z
    .string()
    .optional()
    .describe('Attribute to sort by, e.g. "created_at"'),
  sortDirection: z.enum(["ASC", "DESC"]).optional(),
  fields: z
    .string()
    .optional()
    .describe(
      'Magento response trimming, e.g. "total_count,items[increment_id,status,grand_total]"',
    ),
});

function createSearchTool(config: {
  id: string;
  description: string;
  path: string;
}) {
  return (_env: Env) =>
    createTool({
      id: config.id,
      description: config.description,
      inputSchema: searchInputSchema,
      annotations: { readOnlyHint: true },
      execute: async ({ context, runtimeContext }) => {
        const env = runtimeContext.env as Env;
        const creds = resolveCredentials(env.MESH_REQUEST_CONTEXT?.state);
        assertValidCredentials(creds, config.id);

        const params = buildSearchCriteriaParams({
          filters: context.filters,
          sortOrders:
            context.sortField != null
              ? [
                  {
                    field: context.sortField,
                    direction: context.sortDirection ?? "DESC",
                  },
                ]
              : undefined,
          pageSize: context.pageSize,
          currentPage: context.currentPage,
          fields: context.fields,
        });
        const data = await magentoFetch(creds, config.path, {
          params,
          toolId: config.id,
        });
        return toStructured(data);
      },
    });
}

// ── Single-resource factory ──────────────────────────────────────────────────

function createGetTool<TSchema extends z.ZodObject<z.ZodRawShape>>(config: {
  id: string;
  description: string;
  inputSchema: TSchema;
  buildPath: (input: z.infer<TSchema>) => string;
  buildParams?: (input: z.infer<TSchema>) => URLSearchParams | undefined;
}) {
  return (_env: Env) =>
    createTool({
      id: config.id,
      description: config.description,
      inputSchema: config.inputSchema,
      annotations: { readOnlyHint: true },
      execute: async ({ context, runtimeContext }) => {
        const env = runtimeContext.env as Env;
        const creds = resolveCredentials(env.MESH_REQUEST_CONTEXT?.state);
        assertValidCredentials(creds, config.id);

        const input = context as z.infer<TSchema>;
        const data = await magentoFetch(creds, config.buildPath(input), {
          params: config.buildParams?.(input),
          toolId: config.id,
        });
        return toStructured(data);
      },
    });
}

// ── Sales ────────────────────────────────────────────────────────────────────

export const listOrders = createSearchTool({
  id: "MAGENTO_LIST_ORDERS",
  description:
    'Search orders (/V1/orders) with filters, sorting and pagination. Useful filters: created_at (gteq/lteq, UTC "YYYY-MM-DD HH:MM:SS"), status (eq/in), customer_email (eq), grand_total (gt/lt). Use fields to trim large payloads.',
  path: "/orders",
});

export const getOrder = createGetTool({
  id: "MAGENTO_GET_ORDER",
  description:
    "Get a single order by its numeric entity_id (/V1/orders/{id}), including items, payment, addresses and status history. For the customer-facing order number use MAGENTO_GET_ORDER_BY_INCREMENT_ID.",
  inputSchema: z.object({
    entityId: z
      .number()
      .int()
      .describe("Order entity_id (internal numeric id)"),
  }),
  buildPath: (input) => `/orders/${input.entityId}`,
});

export const getOrderByIncrementId = createGetTool({
  id: "MAGENTO_GET_ORDER_BY_INCREMENT_ID",
  description:
    "Find an order by its customer-facing increment_id (order number shown to shoppers), e.g. 000123456.",
  inputSchema: z.object({
    incrementId: z.string().describe("Customer-facing order number"),
  }),
  buildPath: () => "/orders",
  buildParams: (input) =>
    buildSearchCriteriaParams({
      filters: [
        {
          field: "increment_id",
          value: input.incrementId,
          conditionType: "eq",
        },
      ],
      pageSize: 1,
    }),
});

export const listInvoices = createSearchTool({
  id: "MAGENTO_LIST_INVOICES",
  description:
    "Search invoices (/V1/invoices) with filters, sorting and pagination. Useful filters: created_at, order_id, state.",
  path: "/invoices",
});

export const listShipments = createSearchTool({
  id: "MAGENTO_LIST_SHIPMENTS",
  description:
    "Search shipments (/V1/shipments) with filters, sorting and pagination. Useful filters: created_at, order_id.",
  path: "/shipments",
});

export const listCreditmemos = createSearchTool({
  id: "MAGENTO_LIST_CREDITMEMOS",
  description:
    "Search credit memos / refunds (/V1/creditmemos) with filters, sorting and pagination. Useful filters: created_at, order_id, state.",
  path: "/creditmemos",
});

// ── Catalog ──────────────────────────────────────────────────────────────────

export const listProducts = createSearchTool({
  id: "MAGENTO_LIST_PRODUCTS",
  description:
    "Search products (/V1/products) with filters, sorting and pagination. Useful filters: sku (in/like), name (like), status (eq), type_id (eq), updated_at (gteq).",
  path: "/products",
});

export const getProduct = createGetTool({
  id: "MAGENTO_GET_PRODUCT",
  description:
    "Get a single product by SKU (/V1/products/{sku}) with attributes, price and extension data.",
  inputSchema: z.object({
    sku: z.string().describe("Product SKU"),
  }),
  buildPath: (input) => `/products/${encodeURIComponent(input.sku)}`,
});

export const getCategoryTree = createGetTool({
  id: "MAGENTO_GET_CATEGORY_TREE",
  description:
    "Get the category tree (/V1/categories), optionally rooted at a category and limited in depth.",
  inputSchema: z.object({
    rootCategoryId: z
      .number()
      .int()
      .optional()
      .describe("Root category id (omit for the store's full tree)"),
    depth: z.number().int().optional().describe("How many levels to descend"),
  }),
  buildPath: () => "/categories",
  buildParams: (input) => {
    const params = new URLSearchParams();
    if (input.rootCategoryId !== undefined) {
      params.set("rootCategoryId", String(input.rootCategoryId));
    }
    if (input.depth !== undefined) params.set("depth", String(input.depth));
    return params;
  },
});

export const getCategoryProducts = createGetTool({
  id: "MAGENTO_GET_CATEGORY_PRODUCTS",
  description:
    "List the products assigned to a category (/V1/categories/{id}/products) with SKU and position.",
  inputSchema: z.object({
    categoryId: z.number().int().describe("Category id"),
  }),
  buildPath: (input) => `/categories/${input.categoryId}/products`,
});

// ── Customers ────────────────────────────────────────────────────────────────

export const searchCustomers = createSearchTool({
  id: "MAGENTO_SEARCH_CUSTOMERS",
  description:
    "Search customers (/V1/customers/search) with filters, sorting and pagination. Useful filters: email (eq/like), created_at (gteq), firstname/lastname (like).",
  path: "/customers/search",
});

export const getCustomer = createGetTool({
  id: "MAGENTO_GET_CUSTOMER",
  description:
    "Get a single customer by numeric id (/V1/customers/{id}) with addresses and attributes.",
  inputSchema: z.object({
    customerId: z.number().int().describe("Customer id"),
  }),
  buildPath: (input) => `/customers/${input.customerId}`,
});

// ── Inventory ────────────────────────────────────────────────────────────────

export const getStockItem = createGetTool({
  id: "MAGENTO_GET_STOCK_ITEM",
  description:
    "Get stock information for a SKU (/V1/stockItems/{sku}): qty, is_in_stock, backorders and thresholds.",
  inputSchema: z.object({
    sku: z.string().describe("Product SKU"),
  }),
  buildPath: (input) => `/stockItems/${encodeURIComponent(input.sku)}`,
});

// ── CMS ──────────────────────────────────────────────────────────────────────

export const searchCmsPages = createSearchTool({
  id: "MAGENTO_SEARCH_CMS_PAGES",
  description:
    "Search CMS pages (/V1/cmsPage/search) with filters, sorting and pagination. Useful filters: identifier (like), title (like), is_active (eq).",
  path: "/cmsPage/search",
});

export const searchCmsBlocks = createSearchTool({
  id: "MAGENTO_SEARCH_CMS_BLOCKS",
  description:
    "Search CMS blocks (/V1/cmsBlock/search) with filters, sorting and pagination. Useful filters: identifier (like), title (like), is_active (eq).",
  path: "/cmsBlock/search",
});

// ── Store ────────────────────────────────────────────────────────────────────

export const getStoreConfigs = createGetTool({
  id: "MAGENTO_GET_STORE_CONFIGS",
  description:
    "Get store configurations (/V1/store/storeConfigs): base URLs, locale, timezone, currency codes. Also works as a connectivity/auth smoke test for the configured credentials.",
  inputSchema: z.object({}),
  buildPath: () => "/store/storeConfigs",
});

export const registryTools = [
  listOrders,
  getOrder,
  getOrderByIncrementId,
  listInvoices,
  listShipments,
  listCreditmemos,
  listProducts,
  getProduct,
  getCategoryTree,
  getCategoryProducts,
  searchCustomers,
  getCustomer,
  getStockItem,
  searchCmsPages,
  searchCmsBlocks,
  getStoreConfigs,
];
