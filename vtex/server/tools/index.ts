/**
 * Central export point for all VTEX tools organized by domain.
 */
import {
  getProduct,
  listProducts,
  createProduct,
  updateProduct,
} from "./product/index.ts";
import {
  getSku,
  listSkusByProduct,
  createSku,
  updateSku,
} from "./sku/index.ts";
import {
  getCategory,
  listCategories,
  createCategory,
} from "./category/index.ts";
import { getBrand, listBrands, createBrand } from "./brand/index.ts";
import {
  getOrder,
  listOrders,
  cancelOrder,
  startHandling,
} from "./order/index.ts";
import { getInventoryBySku, updateInventory } from "./inventory/index.ts";
import { getWarehouse, listWarehouses } from "./warehouse/index.ts";
import {
  getPrice,
  getComputedPrice,
  getFixedPrices,
  updatePrice,
  updateFixedPrice,
  deletePrice,
  listPriceTables,
} from "./price/index.ts";

export const tools = [
  // Product
  getProduct,
  listProducts,
  createProduct,
  updateProduct,
  // SKU
  getSku,
  listSkusByProduct,
  createSku,
  updateSku,
  // Category
  getCategory,
  listCategories,
  createCategory,
  // Brand
  getBrand,
  listBrands,
  createBrand,
  // Order
  getOrder,
  listOrders,
  cancelOrder,
  startHandling,
  // Inventory
  getInventoryBySku,
  updateInventory,
  // Warehouse
  getWarehouse,
  listWarehouses,
  // Pricing
  getPrice,
  getComputedPrice,
  getFixedPrices,
  updatePrice,
  updateFixedPrice,
  deletePrice,
  listPriceTables,
];
