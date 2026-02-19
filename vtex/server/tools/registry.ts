/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * Tool Registry — curated list of generated operations exposed as MCP tools.
 *
 * Adding a new tool = one entry per domain section.
 * No manual Zod schemas, no manual client methods, no manual type definitions.
 *
 * The `sdkFn as any` casts are intentional: the generated SDK functions have
 * specific generic Options types that are structurally compatible at runtime
 * but TypeScript can't verify without the cast.
 */
import { createToolFromOperation } from "../lib/tool-adapter.ts";

// ── Catalog: Brand ────────────────────────────────────────────────────────────
import * as catalogZod from "../generated/catalog/zod.gen.ts";
import * as catalogSdk from "../generated/catalog/sdk.gen.ts";

export const brandTools = [
  createToolFromOperation({
    id: "VTEX_GET_BRAND",
    description: "Get brand details by ID.",
    requestSchema: catalogZod.zGetApiCatalogPvtBrandByBrandIdData,
    sdkFn: catalogSdk.getApiCatalogPvtBrandByBrandId as any,
  }),
  createToolFromOperation({
    id: "VTEX_LIST_BRANDS",
    description: "List all brands in the VTEX catalog.",
    requestSchema: catalogZod.zBrandListData,
    sdkFn: catalogSdk.brandList as any,
  }),
  createToolFromOperation({
    id: "VTEX_CREATE_BRAND",
    description: "Create a new brand in the VTEX catalog.",
    requestSchema: catalogZod.zPostApiCatalogPvtBrandData,
    sdkFn: catalogSdk.postApiCatalogPvtBrand as any,
  }),
];

// ── Catalog: Category ─────────────────────────────────────────────────────────
export const categoryTools = [
  createToolFromOperation({
    id: "VTEX_GET_CATEGORY",
    description: "Get category details by ID.",
    requestSchema: catalogZod.zGetApiCatalogPvtCategoryByCategoryIdData,
    sdkFn: catalogSdk.getApiCatalogPvtCategoryByCategoryId as any,
  }),
  createToolFromOperation({
    id: "VTEX_LIST_CATEGORIES",
    description: "List the full category tree.",
    requestSchema: catalogZod.zCategoryTreeData,
    sdkFn: catalogSdk.categoryTree as any,
  }),
  createToolFromOperation({
    id: "VTEX_CREATE_CATEGORY",
    description: "Create a new category in the VTEX catalog.",
    requestSchema: catalogZod.zPostApiCatalogPvtCategoryData,
    sdkFn: catalogSdk.postApiCatalogPvtCategory as any,
  }),
];

// ── Logistics: Warehouse ──────────────────────────────────────────────────────
import * as logisticsZod from "../generated/logistics/zod.gen.ts";
import * as logisticsSdk from "../generated/logistics/sdk.gen.ts";

export const warehouseTools = [
  createToolFromOperation({
    id: "VTEX_GET_WAREHOUSE",
    description: "Get warehouse details by ID.",
    requestSchema: logisticsZod.zWarehouseByIdData,
    sdkFn: logisticsSdk.warehouseById as any,
  }),
  createToolFromOperation({
    id: "VTEX_LIST_WAREHOUSES",
    description: "List all warehouses configured in the VTEX account.",
    requestSchema: logisticsZod.zAllWarehousesData,
    sdkFn: logisticsSdk.allWarehouses as any,
  }),
];

// ── Logistics: Inventory ──────────────────────────────────────────────────────
export const inventoryTools = [
  createToolFromOperation({
    id: "VTEX_GET_INVENTORY",
    description: "Get inventory balance for a SKU across all warehouses.",
    requestSchema: logisticsZod.zInventoryBySkuData,
    sdkFn: logisticsSdk.inventoryBySku as any,
  }),
  createToolFromOperation({
    id: "VTEX_UPDATE_INVENTORY",
    description: "Update inventory quantity for a SKU in a specific warehouse.",
    requestSchema: logisticsZod.zUpdateInventoryBySkuandWarehouseData,
    sdkFn: logisticsSdk.updateInventoryBySkuandWarehouse as any,
  }),
];

// ── Pricing ───────────────────────────────────────────────────────────────────
import * as pricingZod from "../generated/pricing/zod.gen.ts";
import * as pricingSdk from "../generated/pricing/sdk.gen.ts";

export const priceTools = [
  createToolFromOperation({
    id: "VTEX_GET_PRICE",
    description: "Get the base price for a SKU.",
    requestSchema: pricingZod.zGetPriceData,
    sdkFn: pricingSdk.getPrice as any,
  }),
  createToolFromOperation({
    id: "VTEX_GET_COMPUTED_PRICE",
    description:
      "Get the computed/effective price for a SKU in a sales channel, including promotions.",
    requestSchema: pricingZod.zGetComputedPricebypricetableData,
    sdkFn: pricingSdk.getComputedPricebypricetable as any,
  }),
  createToolFromOperation({
    id: "VTEX_GET_FIXED_PRICES",
    description: "Get fixed prices (price overrides) for a SKU.",
    requestSchema: pricingZod.zGetFixedPricesData,
    sdkFn: pricingSdk.getFixedPrices as any,
  }),
  createToolFromOperation({
    id: "VTEX_UPDATE_PRICE",
    description: "Create or update the base price for a SKU.",
    requestSchema: pricingZod.zCreateUpdatePriceOrFixedPriceData,
    sdkFn: pricingSdk.createUpdatePriceOrFixedPrice as any,
  }),
  createToolFromOperation({
    id: "VTEX_UPDATE_FIXED_PRICE",
    description: "Create or update a fixed price override for a SKU.",
    requestSchema:
      pricingZod.zCreateorupdatefixedpricesonpricetableortradepolicyData,
    sdkFn: pricingSdk.createorupdatefixedpricesonpricetableortradepolicy as any,
  }),
  createToolFromOperation({
    id: "VTEX_DELETE_PRICE",
    description: "Delete the price for a SKU.",
    requestSchema: pricingZod.zDeletePriceData,
    sdkFn: pricingSdk.deletePrice as any,
  }),
  createToolFromOperation({
    id: "VTEX_LIST_PRICE_TABLES",
    description: "List all price tables configured in the account.",
    requestSchema: pricingZod.zListpricetablesData,
    sdkFn: pricingSdk.listpricetables as any,
  }),
];

// ── Catalog: Product ──────────────────────────────────────────────────────────
export const productTools = [
  createToolFromOperation({
    id: "VTEX_GET_PRODUCT",
    description:
      "Get a product by its ID. Returns product details including name, description, category, brand, and status.",
    requestSchema: catalogZod.zGetProductbyidData,
    sdkFn: catalogSdk.getProductbyid as any,
  }),
  createToolFromOperation({
    id: "VTEX_LIST_PRODUCTS",
    description:
      "List product and SKU IDs with pagination. Use from and to for pagination (max 250 records per request).",
    requestSchema: catalogZod.zProductAndSkuIdsData,
    sdkFn: catalogSdk.productAndSkuIds as any,
  }),
  createToolFromOperation({
    id: "VTEX_CREATE_PRODUCT",
    description: "Create a new product in the VTEX catalog.",
    requestSchema: catalogZod.zPostApiCatalogPvtProductData,
    sdkFn: catalogSdk.postApiCatalogPvtProduct as any,
  }),
  createToolFromOperation({
    id: "VTEX_UPDATE_PRODUCT",
    description: "Update an existing product in the VTEX catalog.",
    requestSchema: catalogZod.zPutApiCatalogPvtProductByProductIdData,
    sdkFn: catalogSdk.putApiCatalogPvtProductByProductId as any,
  }),
  createToolFromOperation({
    id: "VTEX_GET_PRODUCT_SPECIFICATIONS",
    description: "Get all specifications for a product.",
    requestSchema: catalogZod.zGetProductSpecificationbyProductIdData,
    sdkFn: catalogSdk.getProductSpecificationbyProductId as any,
  }),
  createToolFromOperation({
    id: "VTEX_GET_PRODUCT_BY_REF_ID",
    description: "Get a product by its external reference ID (RefId).",
    requestSchema: catalogZod.zProductbyRefIdData,
    sdkFn: catalogSdk.productbyRefId as any,
  }),
  createToolFromOperation({
    id: "VTEX_GET_PRODUCT_VARIATIONS",
    description: "Get all SKU variations for a product.",
    requestSchema: catalogZod.zProductVariationsData,
    sdkFn: catalogSdk.productVariations as any,
  }),
];

// ── Catalog: SKU ──────────────────────────────────────────────────────────────
export const skuTools = [
  createToolFromOperation({
    id: "VTEX_GET_SKU",
    description: "Get SKU details by ID.",
    requestSchema: catalogZod.zSkuContextData,
    sdkFn: catalogSdk.skuContext as any,
  }),
  createToolFromOperation({
    id: "VTEX_LIST_SKUS_BY_PRODUCT",
    description: "List all SKU IDs for a given product.",
    requestSchema: catalogZod.zSkulistbyProductIdData,
    sdkFn: catalogSdk.skulistbyProductId as any,
  }),
  createToolFromOperation({
    id: "VTEX_CREATE_SKU",
    description: "Create a new SKU for a product.",
    requestSchema: catalogZod.zPostApiCatalogPvtStockkeepingunitData,
    sdkFn: catalogSdk.postApiCatalogPvtStockkeepingunit as any,
  }),
  createToolFromOperation({
    id: "VTEX_UPDATE_SKU",
    description: "Update an existing SKU.",
    requestSchema: catalogZod.zPutApiCatalogPvtStockkeepingunitBySkuIdData,
    sdkFn: catalogSdk.putApiCatalogPvtStockkeepingunitBySkuId as any,
  }),
  createToolFromOperation({
    id: "VTEX_GET_SKU_FILES",
    description: "Get all images/files associated with a SKU.",
    requestSchema: catalogZod.zGetApiCatalogPvtStockkeepingunitBySkuIdFileData,
    sdkFn: catalogSdk.getApiCatalogPvtStockkeepingunitBySkuIdFile as any,
  }),
  createToolFromOperation({
    id: "VTEX_LIST_ALL_SKUS",
    description: "List all SKU IDs in the catalog with pagination.",
    requestSchema: catalogZod.zListallSkuidsData,
    sdkFn: catalogSdk.listallSkuids as any,
  }),
];

// ── Orders ────────────────────────────────────────────────────────────────────
import * as ordersZod from "../generated/orders/zod.gen.ts";
import * as ordersSdk from "../generated/orders/sdk.gen.ts";

export const orderTools = [
  createToolFromOperation({
    id: "VTEX_GET_ORDER",
    description: "Get full details of a specific order by order ID.",
    requestSchema: ordersZod.zGetOrderData,
    sdkFn: ordersSdk.getOrder as any,
  }),
  createToolFromOperation({
    id: "VTEX_LIST_ORDERS",
    description:
      "List orders with optional filters (status, date range, client email, etc.).",
    requestSchema: ordersZod.zListOrdersData,
    sdkFn: ordersSdk.listOrders as any,
  }),
  createToolFromOperation({
    id: "VTEX_CANCEL_ORDER",
    description: "Cancel an order by its ID.",
    requestSchema: ordersZod.zCancelOrderData,
    sdkFn: ordersSdk.cancelOrder as any,
  }),
  createToolFromOperation({
    id: "VTEX_START_HANDLING_ORDER",
    description: "Notify VTEX that handling has started for an order.",
    requestSchema: ordersZod.zStartHandlingData,
    sdkFn: ordersSdk.startHandling as any,
  }),
];

// ── Catalog: Collection ───────────────────────────────────────────────────────
export const collectionTools = [
  createToolFromOperation({
    id: "VTEX_GET_COLLECTION",
    description: "Get collection details by ID.",
    requestSchema: catalogZod.zGetApiCatalogPvtCollectionByCollectionIdData,
    sdkFn: catalogSdk.getApiCatalogPvtCollectionByCollectionId as any,
  }),
  createToolFromOperation({
    id: "VTEX_LIST_COLLECTIONS",
    description: "List all collections in the catalog.",
    requestSchema: catalogZod.zGetAllInactiveCollectionsData,
    sdkFn: catalogSdk.getAllInactiveCollections as any,
  }),
  createToolFromOperation({
    id: "VTEX_CREATE_COLLECTION",
    description: "Create a new product collection.",
    requestSchema: catalogZod.zPostCreateCollectionData,
    sdkFn: catalogSdk.postCreateCollection as any,
  }),
  createToolFromOperation({
    id: "VTEX_UPDATE_COLLECTION",
    description: "Update an existing collection.",
    requestSchema: catalogZod.zPutApiCatalogPvtCollectionByCollectionIdData,
    sdkFn: catalogSdk.putApiCatalogPvtCollectionByCollectionId as any,
  }),
  createToolFromOperation({
    id: "VTEX_DELETE_COLLECTION",
    description: "Delete a collection by ID.",
    requestSchema: catalogZod.zDeleteApiCatalogPvtCollectionByCollectionIdData,
    sdkFn: catalogSdk.deleteApiCatalogPvtCollectionByCollectionId as any,
  }),
  createToolFromOperation({
    id: "VTEX_GET_COLLECTION_PRODUCTS",
    description: "Get all products in a collection.",
    requestSchema: catalogZod.zGetProductsfromacollectionData,
    sdkFn: catalogSdk.getProductsfromacollection as any,
  }),
  createToolFromOperation({
    id: "VTEX_ADD_SKU_TO_COLLECTION",
    description: "Add a SKU to a subcollection.",
    requestSchema:
      catalogZod.zPostApiCatalogPvtSubcollectionBySubCollectionIdStockkeepingunitData,
    sdkFn:
      catalogSdk.postApiCatalogPvtSubcollectionBySubCollectionIdStockkeepingunit as any,
  }),
  createToolFromOperation({
    id: "VTEX_REMOVE_SKU_FROM_COLLECTION",
    description: "Remove a SKU from a subcollection.",
    requestSchema:
      catalogZod.zDeleteApiCatalogPvtSubcollectionBySubCollectionIdStockkeepingunitBySkuIdData,
    sdkFn:
      catalogSdk.deleteApiCatalogPvtSubcollectionBySubCollectionIdStockkeepingunitBySkuId as any,
  }),
];
