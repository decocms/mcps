/**
 * VTEX Product Tools
 * 
 * Tools for fetching and searching products from VTEX
 */
import { createPrivateTool } from "@decocms/runtime/mastra";
import type { Env } from "../main.ts";
import { getClientFromState } from "../lib/vtex-client.ts";
import { toProduct, pickSku, type Product } from "../lib/transform.ts";
import {
  searchProductsInputSchema,
  searchProductsOutputSchema,
  getProductInputSchema,
  getProductOutputSchema,
  getSuggestionsInputSchema,
  getSuggestionsOutputSchema,
} from "./schemas.ts";

// ============================================================================
// Tools
// ============================================================================

/**
 * Get app state from environment, with error handling
 */
function getState(env: Env) {
  const state = env.DECO_REQUEST_CONTEXT?.state;
  if (!state?.account) {
    throw new Error("VTEX account not configured. Please configure the MCP with your VTEX account.");
  }
  return state;
}

/**
 * Search products using VTEX Intelligent Search
 */
export const createSearchProductsTool = (env: Env) =>
  createPrivateTool({
    id: "VTEX_SEARCH_PRODUCTS",
    description: "Search products in VTEX using Intelligent Search. Returns products matching query, collection, or facets with pagination.",
    inputSchema: searchProductsInputSchema,
    outputSchema: searchProductsOutputSchema,
    execute: async ({ context }) => {
      const state = getState(env);
      const client = getClientFromState(state);
      
      const result = await client.searchProducts({
        query: context.query,
        collection: context.collection,
        count: context.count,
        page: context.page,
        sort: context.sort,
        facets: context.facets,
      });

      const baseUrl = `https://${state.account}.vtexcommercestable.com.br`;
      const currency = state.currency || "BRL";

      const products: Product[] = result.products.map((vtexProduct) => {
        const sku = pickSku(vtexProduct.items);
        return toProduct(vtexProduct, sku, baseUrl, currency);
      });

      return {
        products,
        total: result.recordsFiltered,
        page: context.page || 1,
        pageSize: context.count || 12,
      };
    },
  });

/**
 * Get a single product by slug
 */
export const createGetProductTool = (env: Env) =>
  createPrivateTool({
    id: "VTEX_GET_PRODUCT",
    description: "Get a single product by its URL slug. Returns detailed product information including variants, prices, and images.",
    inputSchema: getProductInputSchema,
    outputSchema: getProductOutputSchema,
    execute: async ({ context }) => {
      const state = getState(env);
      const client = getClientFromState(state);
      
      const vtexProduct = await client.getProductBySlug(context.slug);
      
      if (!vtexProduct) {
        return { product: null };
      }

      const baseUrl = `https://${state.account}.vtexcommercestable.com.br`;
      const currency = state.currency || "BRL";
      const sku = pickSku(vtexProduct.items);
      const product = toProduct(vtexProduct, sku, baseUrl, currency);

      return { product };
    },
  });

/**
 * Get search suggestions
 */
export const createGetSuggestionsTool = (env: Env) =>
  createPrivateTool({
    id: "VTEX_GET_SUGGESTIONS",
    description: "Get search autocomplete suggestions for a query. Useful for implementing search-as-you-type functionality.",
    inputSchema: getSuggestionsInputSchema,
    outputSchema: getSuggestionsOutputSchema,
    execute: async ({ context }) => {
      const state = getState(env);
      const client = getClientFromState(state);
      
      const result = await client.getSuggestions(context.query);

      return {
        suggestions: result.searches || [],
      };
    },
  });

// Export all product tools
export const productTools = [
  createSearchProductsTool,
  createGetProductTool,
  createGetSuggestionsTool,
];

