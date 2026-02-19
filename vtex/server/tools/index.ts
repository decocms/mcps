/**
 * Central export point for all VTEX tools.
 *
 * Registry tools are auto-generated from OpenAPI specs via hey-api.
 * Custom tools handle complex multi-step operations.
 */
import type { Env } from "../types/env.ts";
import {
  brandTools,
  categoryTools,
  warehouseTools,
  inventoryTools,
  priceTools,
  productTools,
  skuTools,
  orderTools,
  collectionTools,
} from "./registry.ts";

// ── Custom tools ──────────────────────────────────────────────────────────────
import { searchProductsPublic } from "./custom/search-products-public.ts";
import { getProductSuggestionsPublic } from "./custom/get-product-suggestions-public.ts";
import { getProductWithImages } from "./custom/get-product-with-images.ts";
import { getProductGridStatus } from "./custom/get-product-grid-status.ts";
import { getSkuWithImages } from "./custom/get-sku-with-images.ts";
import { getSkuImagesPublic } from "./custom/get-sku-images-public.ts";
import { getDailySales } from "./custom/get-daily-sales.ts";
import { searchCollections } from "./custom/search-collections.ts";
import {
  addMultipleSkusToCollection,
  removeMultipleSkusFromCollection,
} from "./custom/collection-bulk.ts";

// ── Tool registry factories (env: Env) => Tool ────────────────────────────────
const registryFactories = [
  ...brandTools,
  ...categoryTools,
  ...warehouseTools,
  ...inventoryTools,
  ...priceTools,
  ...productTools,
  ...skuTools,
  ...orderTools,
  ...collectionTools,
];

const customFactories = [
  // Public Catalog (no auth required)
  searchProductsPublic,
  getProductSuggestionsPublic,
  // Product (complex)
  getProductWithImages,
  getProductGridStatus,
  // SKU (complex)
  getSkuWithImages,
  getSkuImagesPublic,
  // Order (complex)
  getDailySales,
  // Collection (complex)
  searchCollections,
  addMultipleSkusToCollection,
  removeMultipleSkusFromCollection,
];

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const tools = [...registryFactories, ...customFactories] as any[];
