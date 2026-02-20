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
    annotations: { readOnlyHint: true },
    requestSchema: catalogZod.zGetApiCatalogPvtBrandByBrandIdData,
    sdkFn: catalogSdk.getApiCatalogPvtBrandByBrandId as any,
  }),
  createToolFromOperation({
    id: "VTEX_LIST_BRANDS",
    description: "List all brands in the VTEX catalog.",
    annotations: { readOnlyHint: true },
    requestSchema: catalogZod.zBrandListData,
    sdkFn: catalogSdk.brandList as any,
  }),
  createToolFromOperation({
    id: "VTEX_CREATE_BRAND",
    description: "Create a new brand in the VTEX catalog.",
    annotations: { destructiveHint: false },
    requestSchema: catalogZod.zPostApiCatalogPvtBrandData,
    sdkFn: catalogSdk.postApiCatalogPvtBrand as any,
  }),
];

// ── Catalog: Category ─────────────────────────────────────────────────────────
export const categoryTools = [
  createToolFromOperation({
    id: "VTEX_GET_CATEGORY",
    description: "Get category details by ID.",
    annotations: { readOnlyHint: true },
    requestSchema: catalogZod.zGetApiCatalogPvtCategoryByCategoryIdData,
    sdkFn: catalogSdk.getApiCatalogPvtCategoryByCategoryId as any,
  }),
  createToolFromOperation({
    id: "VTEX_LIST_CATEGORIES",
    description: "List the full category tree.",
    annotations: { readOnlyHint: true },
    requestSchema: catalogZod.zCategoryTreeData,
    sdkFn: catalogSdk.categoryTree as any,
  }),
  createToolFromOperation({
    id: "VTEX_CREATE_CATEGORY",
    description: "Create a new category in the VTEX catalog.",
    annotations: { destructiveHint: false },
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
    annotations: { readOnlyHint: true },
    requestSchema: logisticsZod.zWarehouseByIdData,
    sdkFn: logisticsSdk.warehouseById as any,
  }),
  createToolFromOperation({
    id: "VTEX_LIST_WAREHOUSES",
    description: "List all warehouses configured in the VTEX account.",
    annotations: { readOnlyHint: true },
    requestSchema: logisticsZod.zAllWarehousesData,
    sdkFn: logisticsSdk.allWarehouses as any,
  }),
];

// ── Logistics: Inventory ──────────────────────────────────────────────────────
export const inventoryTools = [
  createToolFromOperation({
    id: "VTEX_GET_INVENTORY",
    description: "Get inventory balance for a SKU across all warehouses.",
    annotations: { readOnlyHint: true },
    requestSchema: logisticsZod.zInventoryBySkuData,
    sdkFn: logisticsSdk.inventoryBySku as any,
  }),
  createToolFromOperation({
    id: "VTEX_UPDATE_INVENTORY",
    description: "Update inventory quantity for a SKU in a specific warehouse.",
    annotations: { destructiveHint: true },
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
    annotations: { readOnlyHint: true },
    requestSchema: pricingZod.zGetPriceData,
    sdkFn: pricingSdk.getPrice as any,
  }),
  createToolFromOperation({
    id: "VTEX_GET_COMPUTED_PRICE",
    description:
      "Get the computed/effective price for a SKU in a sales channel, including promotions.",
    annotations: { readOnlyHint: true },
    requestSchema: pricingZod.zGetComputedPricebypricetableData,
    sdkFn: pricingSdk.getComputedPricebypricetable as any,
  }),
  createToolFromOperation({
    id: "VTEX_GET_FIXED_PRICES",
    description: "Get fixed prices (price overrides) for a SKU.",
    annotations: { readOnlyHint: true },
    requestSchema: pricingZod.zGetFixedPricesData,
    sdkFn: pricingSdk.getFixedPrices as any,
  }),
  createToolFromOperation({
    id: "VTEX_UPDATE_PRICE",
    description: "Create or update the base price for a SKU.",
    annotations: { destructiveHint: true },
    requestSchema: pricingZod.zCreateUpdatePriceOrFixedPriceData,
    sdkFn: pricingSdk.createUpdatePriceOrFixedPrice as any,
  }),
  createToolFromOperation({
    id: "VTEX_UPDATE_FIXED_PRICE",
    description: "Create or update a fixed price override for a SKU.",
    annotations: { destructiveHint: true },
    requestSchema:
      pricingZod.zCreateorupdatefixedpricesonpricetableortradepolicyData,
    sdkFn: pricingSdk.createorupdatefixedpricesonpricetableortradepolicy as any,
  }),
  createToolFromOperation({
    id: "VTEX_DELETE_PRICE",
    description: "Delete the price for a SKU.",
    annotations: { destructiveHint: true },
    requestSchema: pricingZod.zDeletePriceData,
    sdkFn: pricingSdk.deletePrice as any,
  }),
  createToolFromOperation({
    id: "VTEX_LIST_PRICE_TABLES",
    description: "List all price tables configured in the account.",
    annotations: { readOnlyHint: true },
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
    annotations: { readOnlyHint: true },
    requestSchema: catalogZod.zGetProductbyidData,
    sdkFn: catalogSdk.getProductbyid as any,
  }),
  createToolFromOperation({
    id: "VTEX_LIST_PRODUCTS",
    description:
      "List product and SKU IDs with pagination. Use from and to for pagination (max 250 records per request).",
    annotations: { readOnlyHint: true },
    requestSchema: catalogZod.zProductAndSkuIdsData,
    sdkFn: catalogSdk.productAndSkuIds as any,
  }),
  createToolFromOperation({
    id: "VTEX_CREATE_PRODUCT",
    description: "Create a new product in the VTEX catalog.",
    annotations: { destructiveHint: false },
    requestSchema: catalogZod.zPostApiCatalogPvtProductData,
    sdkFn: catalogSdk.postApiCatalogPvtProduct as any,
  }),
  createToolFromOperation({
    id: "VTEX_UPDATE_PRODUCT",
    description: "Update an existing product in the VTEX catalog.",
    annotations: { destructiveHint: true },
    requestSchema: catalogZod.zPutApiCatalogPvtProductByProductIdData,
    sdkFn: catalogSdk.putApiCatalogPvtProductByProductId as any,
  }),
  createToolFromOperation({
    id: "VTEX_GET_PRODUCT_SPECIFICATIONS",
    description: "Get all specifications for a product.",
    annotations: { readOnlyHint: true },
    requestSchema: catalogZod.zGetProductSpecificationbyProductIdData,
    sdkFn: catalogSdk.getProductSpecificationbyProductId as any,
  }),
  createToolFromOperation({
    id: "VTEX_GET_PRODUCT_BY_REF_ID",
    description: "Get a product by its external reference ID (RefId).",
    annotations: { readOnlyHint: true },
    requestSchema: catalogZod.zProductbyRefIdData,
    sdkFn: catalogSdk.productbyRefId as any,
  }),
  createToolFromOperation({
    id: "VTEX_GET_PRODUCT_VARIATIONS",
    description: "Get all SKU variations for a product.",
    annotations: { readOnlyHint: true },
    requestSchema: catalogZod.zProductVariationsData,
    sdkFn: catalogSdk.productVariations as any,
  }),
];

// ── Catalog: SKU ──────────────────────────────────────────────────────────────
export const skuTools = [
  createToolFromOperation({
    id: "VTEX_GET_SKU",
    description: "Get SKU details by ID.",
    annotations: { readOnlyHint: true },
    requestSchema: catalogZod.zSkuContextData,
    sdkFn: catalogSdk.skuContext as any,
  }),
  createToolFromOperation({
    id: "VTEX_LIST_SKUS_BY_PRODUCT",
    description: "List all SKU IDs for a given product.",
    annotations: { readOnlyHint: true },
    requestSchema: catalogZod.zSkulistbyProductIdData,
    sdkFn: catalogSdk.skulistbyProductId as any,
  }),
  createToolFromOperation({
    id: "VTEX_CREATE_SKU",
    description: "Create a new SKU for a product.",
    annotations: { destructiveHint: false },
    requestSchema: catalogZod.zPostApiCatalogPvtStockkeepingunitData,
    sdkFn: catalogSdk.postApiCatalogPvtStockkeepingunit as any,
  }),
  createToolFromOperation({
    id: "VTEX_UPDATE_SKU",
    description: "Update an existing SKU.",
    annotations: { destructiveHint: true },
    requestSchema: catalogZod.zPutApiCatalogPvtStockkeepingunitBySkuIdData,
    sdkFn: catalogSdk.putApiCatalogPvtStockkeepingunitBySkuId as any,
  }),
  createToolFromOperation({
    id: "VTEX_GET_SKU_FILES",
    description: "Get all images/files associated with a SKU.",
    annotations: { readOnlyHint: true },
    requestSchema: catalogZod.zGetApiCatalogPvtStockkeepingunitBySkuIdFileData,
    sdkFn: catalogSdk.getApiCatalogPvtStockkeepingunitBySkuIdFile as any,
  }),
  createToolFromOperation({
    id: "VTEX_LIST_ALL_SKUS",
    description: "List all SKU IDs in the catalog with pagination.",
    annotations: { readOnlyHint: true },
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
    annotations: { readOnlyHint: true },
    requestSchema: ordersZod.zGetOrderData,
    sdkFn: ordersSdk.getOrder as any,
  }),
  createToolFromOperation({
    id: "VTEX_LIST_ORDERS",
    description:
      "List orders with optional filters (status, date range, client email, etc.).",
    annotations: { readOnlyHint: true },
    requestSchema: ordersZod.zListOrdersData,
    sdkFn: ordersSdk.listOrders as any,
  }),
  createToolFromOperation({
    id: "VTEX_CANCEL_ORDER",
    description: "Cancel an order by its ID.",
    annotations: { destructiveHint: true },
    requestSchema: ordersZod.zCancelOrderData,
    sdkFn: ordersSdk.cancelOrder as any,
  }),
  createToolFromOperation({
    id: "VTEX_START_HANDLING_ORDER",
    description: "Notify VTEX that handling has started for an order.",
    annotations: { destructiveHint: true },
    requestSchema: ordersZod.zStartHandlingData,
    sdkFn: ordersSdk.startHandling as any,
  }),
];

// ── Catalog: Collection ───────────────────────────────────────────────────────
export const collectionTools = [
  createToolFromOperation({
    id: "VTEX_GET_COLLECTION",
    description: "Get collection details by ID.",
    annotations: { readOnlyHint: true },
    requestSchema: catalogZod.zGetApiCatalogPvtCollectionByCollectionIdData,
    sdkFn: catalogSdk.getApiCatalogPvtCollectionByCollectionId as any,
  }),
  createToolFromOperation({
    id: "VTEX_LIST_COLLECTIONS",
    description: "List all collections in the catalog.",
    annotations: { readOnlyHint: true },
    requestSchema: catalogZod.zGetAllInactiveCollectionsData,
    sdkFn: catalogSdk.getAllInactiveCollections as any,
  }),
  createToolFromOperation({
    id: "VTEX_CREATE_COLLECTION",
    description: "Create a new product collection.",
    annotations: { destructiveHint: false },
    requestSchema: catalogZod.zPostCreateCollectionData,
    sdkFn: catalogSdk.postCreateCollection as any,
  }),
  createToolFromOperation({
    id: "VTEX_UPDATE_COLLECTION",
    description: "Update an existing collection.",
    annotations: { destructiveHint: true },
    requestSchema: catalogZod.zPutApiCatalogPvtCollectionByCollectionIdData,
    sdkFn: catalogSdk.putApiCatalogPvtCollectionByCollectionId as any,
  }),
  createToolFromOperation({
    id: "VTEX_DELETE_COLLECTION",
    description: "Delete a collection by ID.",
    annotations: { destructiveHint: true },
    requestSchema: catalogZod.zDeleteApiCatalogPvtCollectionByCollectionIdData,
    sdkFn: catalogSdk.deleteApiCatalogPvtCollectionByCollectionId as any,
  }),
  createToolFromOperation({
    id: "VTEX_GET_COLLECTION_PRODUCTS",
    description: "Get all products in a collection.",
    annotations: { readOnlyHint: true },
    requestSchema: catalogZod.zGetProductsfromacollectionData,
    sdkFn: catalogSdk.getProductsfromacollection as any,
  }),
  createToolFromOperation({
    id: "VTEX_ADD_SKU_TO_COLLECTION",
    description: "Add a SKU to a subcollection.",
    annotations: { destructiveHint: false },
    requestSchema:
      catalogZod.zPostApiCatalogPvtSubcollectionBySubCollectionIdStockkeepingunitData,
    sdkFn:
      catalogSdk.postApiCatalogPvtSubcollectionBySubCollectionIdStockkeepingunit as any,
  }),
  createToolFromOperation({
    id: "VTEX_REMOVE_SKU_FROM_COLLECTION",
    description: "Remove a SKU from a subcollection.",
    annotations: { destructiveHint: true },
    requestSchema:
      catalogZod.zDeleteApiCatalogPvtSubcollectionBySubCollectionIdStockkeepingunitBySkuIdData,
    sdkFn:
      catalogSdk.deleteApiCatalogPvtSubcollectionBySubCollectionIdStockkeepingunitBySkuId as any,
  }),
];

// ── Ads ───────────────────────────────────────────────────────────────────────
import * as adsZod from "../generated/ads/zod.gen.ts";
import * as adsSdk from "../generated/ads/sdk.gen.ts";

export const adsTools = [
  createToolFromOperation({
    id: "VTEX_POST_PRODUCT_BULK_PRODUCTS",
    description: "Synchronize product information.",
    requestSchema: adsZod.zPostProductBulkProductsData,
    sdkFn: adsSdk.postProductBulkProducts as any,
  }),
  createToolFromOperation({
    id: "VTEX_POST_PRODUCT_BULK_INVENTORIES",
    description: "Synchronize inventory information.",
    requestSchema: adsZod.zPostProductBulkInventoriesData,
    sdkFn: adsSdk.postProductBulkInventories as any,
  }),
  createToolFromOperation({
    id: "VTEX_POST_V1_BEACON_IMPRESSION_BY_AD_ID",
    description: "Track ad impressions.",
    requestSchema: adsZod.zPostV1BeaconImpressionByAdIdData,
    sdkFn: adsSdk.postV1BeaconImpressionByAdId as any,
  }),
  createToolFromOperation({
    id: "VTEX_POST_V1_BEACON_CLICK_BY_AD_ID",
    description: "Track ad clicks.",
    requestSchema: adsZod.zPostV1BeaconClickByAdIdData,
    sdkFn: adsSdk.postV1BeaconClickByAdId as any,
  }),
  createToolFromOperation({
    id: "VTEX_POST_V1_BEACON_VIEW_BY_AD_ID",
    description: "Track ad views.",
    requestSchema: adsZod.zPostV1BeaconViewByAdIdData,
    sdkFn: adsSdk.postV1BeaconViewByAdId as any,
  }),
  createToolFromOperation({
    id: "VTEX_POST_V1_BEACON_CONVERSION",
    description: "Track conversions.",
    requestSchema: adsZod.zPostV1BeaconConversionData,
    sdkFn: adsSdk.postV1BeaconConversion as any,
  }),
  createToolFromOperation({
    id: "VTEX_POST_V1_RMA_BY_PUBLISHER_ID",
    description: "Get ads.",
    requestSchema: adsZod.zPostV1RmaByPublisherIdData,
    sdkFn: adsSdk.postV1RmaByPublisherId as any,
  }),
];

// ── Antifraud Provider Protocol ───────────────────────────────────────────────
import * as antifraudProviderZod from "../generated/antifraud-provider/zod.gen.ts";
import * as antifraudProviderSdk from "../generated/antifraud-provider/sdk.gen.ts";

export const antifraudProviderTools = [
  createToolFromOperation({
    id: "VTEX_SEND_ANTIFRAUD_PRE_ANALYSIS_DATA",
    description: "Send anti-fraud pre-analysis data (optional).",
    requestSchema: antifraudProviderZod.zSendAntifraudPreAnalysisDataData,
    sdkFn: antifraudProviderSdk.sendAntifraudPreAnalysisData as any,
  }),
  createToolFromOperation({
    id: "VTEX_SEND_ANTIFRAUD_DATA",
    description: "Send anti-fraud data.",
    requestSchema: antifraudProviderZod.zSendAntifraudDataData,
    sdkFn: antifraudProviderSdk.sendAntifraudData as any,
  }),
  createToolFromOperation({
    id: "VTEX_UPDATE_ANTIFRAUD_TRANSACTIONS_OPTIONAL",
    description: "Update anti-fraud transactions (optional).",
    requestSchema:
      antifraudProviderZod.zUpdateAntifraudTransactionsOptionalData,
    sdkFn: antifraudProviderSdk.updateAntifraudTransactionsOptional as any,
  }),
  createToolFromOperation({
    id: "VTEX_ANTIFRAUD_MANIFEST",
    description: "List anti-fraud provider manifest.",
    annotations: { readOnlyHint: true },
    requestSchema: antifraudProviderZod.zManifestData,
    sdkFn: antifraudProviderSdk.manifest as any,
  }),
  createToolFromOperation({
    id: "VTEX_GET_ANTIFRAUD_STATUS",
    description: "Get anti-fraud status.",
    annotations: { readOnlyHint: true },
    requestSchema: antifraudProviderZod.zGetAntifraudStatusData,
    sdkFn: antifraudProviderSdk.getAntifraudStatus as any,
  }),
  createToolFromOperation({
    id: "VTEX_STOP_ANTIFRAUD_ANALYSIS_OPTIONAL",
    description: "Stop anti-fraud analysis (optional).",
    annotations: { destructiveHint: true },
    requestSchema: antifraudProviderZod.zStopAntifraudAnalysisOptionalData,
    sdkFn: antifraudProviderSdk.stopAntifraudAnalysisOptional as any,
  }),
  createToolFromOperation({
    id: "VTEX_ANTIFRAUD_RETRIEVE_TOKEN",
    description: "Retrieve antifraud provider token.",
    requestSchema: antifraudProviderZod.zRetrieveTokenData,
    sdkFn: antifraudProviderSdk._1RetrieveToken as any,
  }),
  createToolFromOperation({
    id: "VTEX_ANTIFRAUD_REDIRECT",
    description: "Redirect for antifraud provider authentication.",
    annotations: { readOnlyHint: true },
    requestSchema: antifraudProviderZod.zRedirectData,
    sdkFn: antifraudProviderSdk._2Redirect as any,
  }),
  createToolFromOperation({
    id: "VTEX_ANTIFRAUD_RETURN_TO_VTEX",
    description: "Return to VTEX after antifraud provider authentication.",
    annotations: { readOnlyHint: true },
    requestSchema: antifraudProviderZod.zReturntoVtexData,
    sdkFn: antifraudProviderSdk._3ReturntoVtex as any,
  }),
  createToolFromOperation({
    id: "VTEX_ANTIFRAUD_GET_CREDENTIALS",
    description: "Get antifraud provider credentials.",
    annotations: { readOnlyHint: true },
    requestSchema: antifraudProviderZod.zGetCredentialsData,
    sdkFn: antifraudProviderSdk._4GetCredentials as any,
  }),
];

// ── Audience ──────────────────────────────────────────────────────────────────
import * as audienceZod from "../generated/audience/zod.gen.ts";
import * as audienceSdk from "../generated/audience/sdk.gen.ts";

export const audienceTools = [
  createToolFromOperation({
    id: "VTEX_POST_API_AUDIENCE_MANAGER_PVT_AUDIENCE",
    description: "Fetch audience.",
    requestSchema: audienceZod.zPostApiAudienceManagerPvtAudienceData,
    sdkFn: audienceSdk.postApiAudienceManagerPvtAudience as any,
  }),
  createToolFromOperation({
    id: "VTEX_DELETE_API_PRICE_TABLE_MAPPER_PVT_MAPPING_BY_AUDIENCE_ID",
    description: "Delete price table mapping.",
    annotations: { destructiveHint: true },
    requestSchema:
      audienceZod.zDeleteApiPriceTableMapperPvtMappingByAudienceIdData,
    sdkFn: audienceSdk.deleteApiPriceTableMapperPvtMappingByAudienceId as any,
  }),
  createToolFromOperation({
    id: "VTEX_GET_API_PRICE_TABLE_MAPPER_PVT_MAPPING_BY_AUDIENCE_ID",
    description: "Get price table mapping.",
    annotations: { readOnlyHint: true },
    requestSchema:
      audienceZod.zGetApiPriceTableMapperPvtMappingByAudienceIdData,
    sdkFn: audienceSdk.getApiPriceTableMapperPvtMappingByAudienceId as any,
  }),
  createToolFromOperation({
    id: "VTEX_PUT_API_PRICE_TABLE_MAPPER_PVT_MAPPING_BY_AUDIENCE_ID",
    description: "Set price table mapping.",
    requestSchema:
      audienceZod.zPutApiPriceTableMapperPvtMappingByAudienceIdData,
    sdkFn: audienceSdk.putApiPriceTableMapperPvtMappingByAudienceId as any,
  }),
];

// ── B2B Buyer Data ─────────────────────────────────────────────────────────────
import * as b2bBuyerDataZod from "../generated/b2b-buyer-data/zod.gen.ts";
import * as b2bBuyerDataSdk from "../generated/b2b-buyer-data/sdk.gen.ts";

export const b2bBuyerDataTools = [
  createToolFromOperation({
    id: "VTEX_GET_API_DATAENTITIES_SHOPPER_SCHEMAS_V1",
    description: "Get buyer schema.",
    annotations: { readOnlyHint: true },
    requestSchema: b2bBuyerDataZod.zGetApiDataentitiesShopperSchemasV1Data,
    sdkFn: b2bBuyerDataSdk.getApiDataentitiesShopperSchemasV1 as any,
  }),
  createToolFromOperation({
    id: "VTEX_POST_API_DATAENTITIES_SHOPPER_DOCUMENTS",
    description: "Create buyer.",
    requestSchema: b2bBuyerDataZod.zPostApiDataentitiesShopperDocumentsData,
    sdkFn: b2bBuyerDataSdk.postApiDataentitiesShopperDocuments as any,
  }),
  createToolFromOperation({
    id: "VTEX_DELETE_API_DATAENTITIES_SHOPPER_DOCUMENTS_BY_BUYER_ID",
    description: "Delete buyer.",
    annotations: { destructiveHint: true },
    requestSchema:
      b2bBuyerDataZod.zDeleteApiDataentitiesShopperDocumentsByBuyerIdData,
    sdkFn:
      b2bBuyerDataSdk.deleteApiDataentitiesShopperDocumentsByBuyerId as any,
  }),
  createToolFromOperation({
    id: "VTEX_GET_API_DATAENTITIES_SHOPPER_DOCUMENTS_BY_BUYER_ID",
    description: "Get buyer by ID.",
    annotations: { readOnlyHint: true },
    requestSchema:
      b2bBuyerDataZod.zGetApiDataentitiesShopperDocumentsByBuyerIdData,
    sdkFn: b2bBuyerDataSdk.getApiDataentitiesShopperDocumentsByBuyerId as any,
  }),
  createToolFromOperation({
    id: "VTEX_PATCH_API_DATAENTITIES_SHOPPER_DOCUMENTS_BY_BUYER_ID",
    description: "Update buyer.",
    requestSchema:
      b2bBuyerDataZod.zPatchApiDataentitiesShopperDocumentsByBuyerIdData,
    sdkFn: b2bBuyerDataSdk.patchApiDataentitiesShopperDocumentsByBuyerId as any,
  }),
  createToolFromOperation({
    id: "VTEX_GET_API_DATAENTITIES_SHOPPER_SEARCH",
    description: "Search buyers.",
    annotations: { readOnlyHint: true },
    requestSchema: b2bBuyerDataZod.zGetApiDataentitiesShopperSearchData,
    sdkFn: b2bBuyerDataSdk.getApiDataentitiesShopperSearch as any,
  }),
];

// ── B2B Contact Information ────────────────────────────────────────────────────
import * as b2bContactInformationZod from "../generated/b2b-contact-information/zod.gen.ts";
import * as b2bContactInformationSdk from "../generated/b2b-contact-information/sdk.gen.ts";

export const b2bContactInformationTools = [
  createToolFromOperation({
    id: "VTEX_POST_API_DATAENTITIES_CONTACT_INFORMATION_DOCUMENTS",
    description: "Create new contact information.",
    requestSchema:
      b2bContactInformationZod.zPostApiDataentitiesContactInformationDocumentsData,
    sdkFn:
      b2bContactInformationSdk.postApiDataentitiesContactInformationDocuments as any,
  }),
  createToolFromOperation({
    id: "VTEX_GET_API_DATAENTITIES_CONTACT_INFORMATION_SEARCH",
    description: "Search contact information.",
    annotations: { readOnlyHint: true },
    requestSchema:
      b2bContactInformationZod.zGetApiDataentitiesContactInformationSearchData,
    sdkFn:
      b2bContactInformationSdk.getApiDataentitiesContactInformationSearch as any,
  }),
  createToolFromOperation({
    id: "VTEX_DELETE_API_DATAENTITIES_CONTACT_INFORMATION_DOCUMENTS_BY_ID",
    description: "Delete contact information.",
    annotations: { destructiveHint: true },
    requestSchema:
      b2bContactInformationZod.zDeleteApiDataentitiesContactInformationDocumentsByIdData,
    sdkFn:
      b2bContactInformationSdk.deleteApiDataentitiesContactInformationDocumentsById as any,
  }),
  createToolFromOperation({
    id: "VTEX_GET_API_DATAENTITIES_CONTACT_INFORMATION_DOCUMENTS_BY_ID",
    description: "Get contact information by ID.",
    annotations: { readOnlyHint: true },
    requestSchema:
      b2bContactInformationZod.zGetApiDataentitiesContactInformationDocumentsByIdData,
    sdkFn:
      b2bContactInformationSdk.getApiDataentitiesContactInformationDocumentsById as any,
  }),
  createToolFromOperation({
    id: "VTEX_PATCH_API_DATAENTITIES_CONTACT_INFORMATION_DOCUMENTS_BY_ID",
    description: "Update contact information.",
    requestSchema:
      b2bContactInformationZod.zPatchApiDataentitiesContactInformationDocumentsByIdData,
    sdkFn:
      b2bContactInformationSdk.patchApiDataentitiesContactInformationDocumentsById as any,
  }),
];

// ── B2B Contracts ──────────────────────────────────────────────────────────────
import * as b2bContractsZod from "../generated/b2b-contracts/zod.gen.ts";
import * as b2bContractsSdk from "../generated/b2b-contracts/sdk.gen.ts";

export const b2bContractsTools = [
  createToolFromOperation({
    id: "VTEX_CREATE_CONTRACT",
    description: "Create contract.",
    requestSchema: b2bContractsZod.zCreateContractData,
    sdkFn: b2bContractsSdk.createContract as any,
  }),
  createToolFromOperation({
    id: "VTEX_DELETE_API_DATAENTITIES_CL_DOCUMENTS_BY_CONTRACT_ID",
    description: "Delete contract by ID.",
    annotations: { destructiveHint: true },
    requestSchema:
      b2bContractsZod.zDeleteApiDataentitiesClDocumentsByContractIdData,
    sdkFn: b2bContractsSdk.deleteApiDataentitiesClDocumentsByContractId as any,
  }),
  createToolFromOperation({
    id: "VTEX_GET_API_DATAENTITIES_CL_DOCUMENTS_BY_CONTRACT_ID",
    description: "Get contract by ID.",
    annotations: { readOnlyHint: true },
    requestSchema:
      b2bContractsZod.zGetApiDataentitiesClDocumentsByContractIdData,
    sdkFn: b2bContractsSdk.getApiDataentitiesClDocumentsByContractId as any,
  }),
  createToolFromOperation({
    id: "VTEX_PATCH_API_DATAENTITIES_CL_DOCUMENTS_BY_CONTRACT_ID",
    description: "Update contract by ID.",
    requestSchema:
      b2bContractsZod.zPatchApiDataentitiesClDocumentsByContractIdData,
    sdkFn: b2bContractsSdk.patchApiDataentitiesClDocumentsByContractId as any,
  }),
];

// ── Budgets ───────────────────────────────────────────────────────────────────
import * as budgetsZod from "../generated/budgets/zod.gen.ts";
import * as budgetsSdk from "../generated/budgets/sdk.gen.ts";

export const budgetsTools = [
  createToolFromOperation({
    id: "VTEX_GET_BUDGETS_STATEMENTS",
    description: "Get budget statements.",
    annotations: { readOnlyHint: true },
    requestSchema:
      budgetsZod.zGetApiBudgetsByContextTypeByContextIdByBudgetIdStatementsData,
    sdkFn:
      budgetsSdk.getApiBudgetsByContextTypeByContextIdByBudgetIdStatements as any,
  }),
  createToolFromOperation({
    id: "VTEX_GET_BUDGETS_ALLOCATION_STATEMENTS",
    description: "Get allocation statements.",
    annotations: { readOnlyHint: true },
    requestSchema:
      budgetsZod.zGetApiBudgetsByContextTypeByContextIdByBudgetIdAllocationsByAllocationIdStatementsData,
    sdkFn:
      budgetsSdk.getApiBudgetsByContextTypeByContextIdByBudgetIdAllocationsByAllocationIdStatements as any,
  }),
  createToolFromOperation({
    id: "VTEX_POST_BUDGETS_ALLOCATION_TRANSACTION",
    description: "Create transaction.",
    requestSchema:
      budgetsZod.zPostApiBudgetsByContextTypeByContextIdByBudgetIdAllocationsByAllocationIdTransactionsData,
    sdkFn:
      budgetsSdk.postApiBudgetsByContextTypeByContextIdByBudgetIdAllocationsByAllocationIdTransactions as any,
  }),
  createToolFromOperation({
    id: "VTEX_POST_BUDGETS_ALLOCATION_TRANSACTION_REFUND",
    description: "Refund transaction.",
    requestSchema:
      budgetsZod.zPostApiBudgetsByContextTypeByContextIdByBudgetIdAllocationsByAllocationIdTransactionsByTransactionIdRefundData,
    sdkFn:
      budgetsSdk.postApiBudgetsByContextTypeByContextIdByBudgetIdAllocationsByAllocationIdTransactionsByTransactionIdRefund as any,
  }),
  createToolFromOperation({
    id: "VTEX_GET_BUDGETS_ALLOCATION_TRANSACTION",
    description: "Get transaction.",
    annotations: { readOnlyHint: true },
    requestSchema:
      budgetsZod.zGetApiBudgetsByContextTypeByContextIdByBudgetIdAllocationsByAllocationIdTransactionsByTransactionIdData,
    sdkFn:
      budgetsSdk.getApiBudgetsByContextTypeByContextIdByBudgetIdAllocationsByAllocationIdTransactionsByTransactionId as any,
  }),
  createToolFromOperation({
    id: "VTEX_GET_BUDGETS_ALLOCATION_RESERVATIONS",
    description: "List reservations.",
    annotations: { readOnlyHint: true },
    requestSchema:
      budgetsZod.zGetApiBudgetsByContextTypeByContextIdByBudgetIdAllocationsByAllocationIdReservationsData,
    sdkFn:
      budgetsSdk.getApiBudgetsByContextTypeByContextIdByBudgetIdAllocationsByAllocationIdReservations as any,
  }),
  createToolFromOperation({
    id: "VTEX_POST_BUDGETS_ALLOCATION_RESERVATION",
    description: "Create reservation.",
    requestSchema:
      budgetsZod.zPostApiBudgetsByContextTypeByContextIdByBudgetIdAllocationsByAllocationIdReservationsData,
    sdkFn:
      budgetsSdk.postApiBudgetsByContextTypeByContextIdByBudgetIdAllocationsByAllocationIdReservations as any,
  }),
  createToolFromOperation({
    id: "VTEX_DELETE_BUDGETS_ALLOCATION_RESERVATION",
    description: "Delete reservation.",
    annotations: { destructiveHint: true },
    requestSchema:
      budgetsZod.zDeleteApiBudgetsByContextTypeByContextIdByBudgetIdAllocationsByAllocationIdReservationsByReservationIdData,
    sdkFn:
      budgetsSdk.deleteApiBudgetsByContextTypeByContextIdByBudgetIdAllocationsByAllocationIdReservationsByReservationId as any,
  }),
  createToolFromOperation({
    id: "VTEX_GET_BUDGETS_ALLOCATION_RESERVATION",
    description: "Get reservation.",
    annotations: { readOnlyHint: true },
    requestSchema:
      budgetsZod.zGetApiBudgetsByContextTypeByContextIdByBudgetIdAllocationsByAllocationIdReservationsByReservationIdData,
    sdkFn:
      budgetsSdk.getApiBudgetsByContextTypeByContextIdByBudgetIdAllocationsByAllocationIdReservationsByReservationId as any,
  }),
  createToolFromOperation({
    id: "VTEX_POST_BUDGETS_ALLOCATION_RESERVATION_CONFIRMATION",
    description: "Confirm reservation.",
    requestSchema:
      budgetsZod.zPostApiBudgetsByContextTypeByContextIdByBudgetIdAllocationsByAllocationIdReservationsByReservationIdConfirmationData,
    sdkFn:
      budgetsSdk.postApiBudgetsByContextTypeByContextIdByBudgetIdAllocationsByAllocationIdReservationsByReservationIdConfirmation as any,
  }),
  createToolFromOperation({
    id: "VTEX_GET_BUDGETS_ALLOCATIONS",
    description: "List budget allocations.",
    annotations: { readOnlyHint: true },
    requestSchema:
      budgetsZod.zGetApiBudgetsByContextTypeByContextIdByBudgetIdAllocationsData,
    sdkFn:
      budgetsSdk.getApiBudgetsByContextTypeByContextIdByBudgetIdAllocations as any,
  }),
  createToolFromOperation({
    id: "VTEX_POST_BUDGETS_ALLOCATION",
    description: "Create allocation.",
    requestSchema:
      budgetsZod.zPostApiBudgetsByContextTypeByContextIdByBudgetIdAllocationsData,
    sdkFn:
      budgetsSdk.postApiBudgetsByContextTypeByContextIdByBudgetIdAllocations as any,
  }),
  createToolFromOperation({
    id: "VTEX_POST_BUDGETS_ALLOCATIONS_BATCH",
    description: "Create batch of allocations.",
    requestSchema:
      budgetsZod.zPostApiBudgetsByContextTypeByContextIdByBudgetIdAllocationsBatchData,
    sdkFn:
      budgetsSdk.postApiBudgetsByContextTypeByContextIdByBudgetIdAllocationsBatch as any,
  }),
  createToolFromOperation({
    id: "VTEX_DELETE_BUDGETS_ALLOCATION",
    description: "Delete allocation.",
    annotations: { destructiveHint: true },
    requestSchema:
      budgetsZod.zDeleteApiBudgetsByContextTypeByContextIdByBudgetIdAllocationsByAllocationIdData,
    sdkFn:
      budgetsSdk.deleteApiBudgetsByContextTypeByContextIdByBudgetIdAllocationsByAllocationId as any,
  }),
  createToolFromOperation({
    id: "VTEX_GET_BUDGETS_ALLOCATION",
    description: "Get allocation.",
    annotations: { readOnlyHint: true },
    requestSchema:
      budgetsZod.zGetApiBudgetsByContextTypeByContextIdByBudgetIdAllocationsByAllocationIdData,
    sdkFn:
      budgetsSdk.getApiBudgetsByContextTypeByContextIdByBudgetIdAllocationsByAllocationId as any,
  }),
  createToolFromOperation({
    id: "VTEX_PUT_BUDGETS_ALLOCATION",
    description: "Update allocation.",
    requestSchema:
      budgetsZod.zPutApiBudgetsByContextTypeByContextIdByBudgetIdAllocationsByAllocationIdData,
    sdkFn:
      budgetsSdk.putApiBudgetsByContextTypeByContextIdByBudgetIdAllocationsByAllocationId as any,
  }),
  createToolFromOperation({
    id: "VTEX_PUT_BUDGETS_ALLOCATION_LINKED_ENTITY",
    description: "Update allocation linked entity.",
    requestSchema:
      budgetsZod.zPutApiBudgetsByContextTypeByContextIdByBudgetIdAllocationsByAllocationIdLinkedEntityData,
    sdkFn:
      budgetsSdk.putApiBudgetsByContextTypeByContextIdByBudgetIdAllocationsByAllocationIdLinkedEntity as any,
  }),
  createToolFromOperation({
    id: "VTEX_PUT_BUDGETS_ALLOCATION_STATUS",
    description: "Change allocation status.",
    requestSchema:
      budgetsZod.zPutApiBudgetsByContextTypeByContextIdByBudgetIdAllocationsByAllocationIdStatusData,
    sdkFn:
      budgetsSdk.putApiBudgetsByContextTypeByContextIdByBudgetIdAllocationsByAllocationIdStatus as any,
  }),
  createToolFromOperation({
    id: "VTEX_PUT_BUDGETS_ALLOCATION_USAGE",
    description: "Update allocation usage.",
    requestSchema:
      budgetsZod.zPutApiBudgetsByContextTypeByContextIdByBudgetIdAllocationsByAllocationIdUsageData,
    sdkFn:
      budgetsSdk.putApiBudgetsByContextTypeByContextIdByBudgetIdAllocationsByAllocationIdUsage as any,
  }),
  createToolFromOperation({
    id: "VTEX_POST_BUDGETS_ALLOCATIONS_QUERY",
    description: "Query allocations.",
    requestSchema:
      budgetsZod.zPostApiBudgetsByContextTypeByContextIdAllocationsQueryData,
    sdkFn:
      budgetsSdk.postApiBudgetsByContextTypeByContextIdAllocationsQuery as any,
  }),
  createToolFromOperation({
    id: "VTEX_GET_BUDGETS",
    description: "List budgets.",
    annotations: { readOnlyHint: true },
    requestSchema: budgetsZod.zGetApiBudgetsByContextTypeByContextIdData,
    sdkFn: budgetsSdk.getApiBudgetsByContextTypeByContextId as any,
  }),
  createToolFromOperation({
    id: "VTEX_POST_BUDGET",
    description: "Create budget.",
    requestSchema: budgetsZod.zPostApiBudgetsByContextTypeByContextIdData,
    sdkFn: budgetsSdk.postApiBudgetsByContextTypeByContextId as any,
  }),
  createToolFromOperation({
    id: "VTEX_DELETE_BUDGET",
    description: "Delete budget.",
    annotations: { destructiveHint: true },
    requestSchema:
      budgetsZod.zDeleteApiBudgetsByContextTypeByContextIdByBudgetIdData,
    sdkFn: budgetsSdk.deleteApiBudgetsByContextTypeByContextIdByBudgetId as any,
  }),
  createToolFromOperation({
    id: "VTEX_GET_BUDGET",
    description: "Get budget.",
    annotations: { readOnlyHint: true },
    requestSchema:
      budgetsZod.zGetApiBudgetsByContextTypeByContextIdByBudgetIdData,
    sdkFn: budgetsSdk.getApiBudgetsByContextTypeByContextIdByBudgetId as any,
  }),
  createToolFromOperation({
    id: "VTEX_PUT_BUDGET",
    description: "Update budget.",
    requestSchema:
      budgetsZod.zPutApiBudgetsByContextTypeByContextIdByBudgetIdData,
    sdkFn: budgetsSdk.putApiBudgetsByContextTypeByContextIdByBudgetId as any,
  }),
  createToolFromOperation({
    id: "VTEX_PUT_BUDGET_STATUS",
    description: "Update budget status.",
    requestSchema:
      budgetsZod.zPutApiBudgetsByContextTypeByContextIdByBudgetIdStatusData,
    sdkFn:
      budgetsSdk.putApiBudgetsByContextTypeByContextIdByBudgetIdStatus as any,
  }),
];

// ── Buyer Organizations ────────────────────────────────────────────────────────
import * as buyerOrganizationsZod from "../generated/buyer-organizations/zod.gen.ts";
import * as buyerOrganizationsSdk from "../generated/buyer-organizations/sdk.gen.ts";

export const buyerOrganizationsTools = [
  createToolFromOperation({
    id: "VTEX_BUYER_ORGS_UPLOAD_FILE",
    description: "Upload file.",
    requestSchema: buyerOrganizationsZod.zUploadFileData,
    sdkFn: buyerOrganizationsSdk.uploadFile as any,
  }),
  createToolFromOperation({
    id: "VTEX_BUYER_ORGS_CHECK_PROGRESS",
    description: "Check progress.",
    annotations: { readOnlyHint: true },
    requestSchema: buyerOrganizationsZod.zCheckProgressData,
    sdkFn: buyerOrganizationsSdk.checkProgress as any,
  }),
  createToolFromOperation({
    id: "VTEX_POST_API_B2B_IMPORT_BUYER_ORGS_BY_IMPORT_ID",
    description: "Start import.",
    requestSchema:
      buyerOrganizationsZod.zPostApiB2bImportBuyerOrgsByImportIdData,
    sdkFn: buyerOrganizationsSdk.postApiB2bImportBuyerOrgsByImportId as any,
  }),
  createToolFromOperation({
    id: "VTEX_BUYER_ORGS_VALIDATE_FILE",
    description: "Validate file.",
    requestSchema: buyerOrganizationsZod.zValidateFileData,
    sdkFn: buyerOrganizationsSdk.validateFile as any,
  }),
];

// ── Buying Policies ────────────────────────────────────────────────────────────
import * as buyingPoliciesZod from "../generated/buying-policies/zod.gen.ts";
import * as buyingPoliciesSdk from "../generated/buying-policies/sdk.gen.ts";

export const buyingPoliciesTools = [
  createToolFromOperation({
    id: "VTEX_GET_AUTHORIZATION_DIMENSIONS",
    description: "Get dimensions information.",
    annotations: { readOnlyHint: true },
    requestSchema:
      buyingPoliciesZod.zGetByAccountNameAuthorizationDimensionsData,
    sdkFn: buyingPoliciesSdk.getByAccountNameAuthorizationDimensions as any,
  }),
  createToolFromOperation({
    id: "VTEX_POST_AUTHORIZATION_DIMENSION",
    description: "Create dimension.",
    requestSchema:
      buyingPoliciesZod.zPostByAccountNameAuthorizationDimensionsData,
    sdkFn: buyingPoliciesSdk.postByAccountNameAuthorizationDimensions as any,
  }),
  createToolFromOperation({
    id: "VTEX_DELETE_AUTHORIZATION_DIMENSION",
    description: "Delete dimension.",
    annotations: { destructiveHint: true },
    requestSchema:
      buyingPoliciesZod.zDeleteByAccountNameAuthorizationDimensionsByDimensionIdData,
    sdkFn:
      buyingPoliciesSdk.deleteByAccountNameAuthorizationDimensionsByDimensionId as any,
  }),
  createToolFromOperation({
    id: "VTEX_PUT_AUTHORIZATION_DIMENSION",
    description: "Update dimension.",
    requestSchema:
      buyingPoliciesZod.zPutByAccountNameAuthorizationDimensionsByDimensionIdData,
    sdkFn:
      buyingPoliciesSdk.putByAccountNameAuthorizationDimensionsByDimensionId as any,
  }),
  createToolFromOperation({
    id: "VTEX_POST_AUTHORIZATION_DIMENSION_RULE",
    description: "Create dimension rule.",
    requestSchema:
      buyingPoliciesZod.zPostByAccountNameAuthorizationDimensionsByDimensionIdRulesData,
    sdkFn:
      buyingPoliciesSdk.postByAccountNameAuthorizationDimensionsByDimensionIdRules as any,
  }),
  createToolFromOperation({
    id: "VTEX_PUT_AUTHORIZATION_DIMENSION_RULES",
    description: "Update all dimension rules.",
    requestSchema:
      buyingPoliciesZod.zPutByAccountNameAuthorizationDimensionsByDimensionIdRulesData,
    sdkFn:
      buyingPoliciesSdk.putByAccountNameAuthorizationDimensionsByDimensionIdRules as any,
  }),
  createToolFromOperation({
    id: "VTEX_DELETE_AUTHORIZATION_DIMENSION_RULE",
    description: "Delete dimension rule.",
    annotations: { destructiveHint: true },
    requestSchema:
      buyingPoliciesZod.zDeleteByAccountNameAuthorizationDimensionsByDimensionIdRulesByRuleIdData,
    sdkFn:
      buyingPoliciesSdk.deleteByAccountNameAuthorizationDimensionsByDimensionIdRulesByRuleId as any,
  }),
  createToolFromOperation({
    id: "VTEX_PUT_AUTHORIZATION_DIMENSION_RULE",
    description: "Update dimension rule.",
    requestSchema:
      buyingPoliciesZod.zPutByAccountNameAuthorizationDimensionsByDimensionIdRulesByRuleIdData,
    sdkFn:
      buyingPoliciesSdk.putByAccountNameAuthorizationDimensionsByDimensionIdRulesByRuleId as any,
  }),
  createToolFromOperation({
    id: "VTEX_POST_COMMERCIAL_AUTHORIZATION_CALLBACK",
    description: "Accept or deny rule.",
    requestSchema:
      buyingPoliciesZod.zPostCommercialAuthorizationsByOrderAuthIdCallbackData,
    sdkFn:
      buyingPoliciesSdk.postCommercialAuthorizationsByOrderAuthIdCallback as any,
  }),
];

// ── Card Token Vault ───────────────────────────────────────────────────────────
import * as cardTokenVaultZod from "../generated/card-token-vault/zod.gen.ts";
import * as cardTokenVaultSdk from "../generated/card-token-vault/sdk.gen.ts";

export const cardTokenVaultTools = [
  createToolFromOperation({
    id: "VTEX_CREATE_CARD_TOKEN",
    description: "Create card token.",
    requestSchema: cardTokenVaultZod.zCreateCardTokenData,
    sdkFn: cardTokenVaultSdk.createCardToken as any,
  }),
  createToolFromOperation({
    id: "VTEX_UPDATE_CARD_TOKEN",
    description: "Update card token.",
    requestSchema: cardTokenVaultZod.zUpdateCardTokenData,
    sdkFn: cardTokenVaultSdk.updateCardToken as any,
  }),
  createToolFromOperation({
    id: "VTEX_DELETE_CARD_TOKEN",
    description: "Delete card token.",
    annotations: { destructiveHint: true },
    requestSchema: cardTokenVaultZod.zDeleteCardTokenData,
    sdkFn: cardTokenVaultSdk.deleteCardToken as any,
  }),
  createToolFromOperation({
    id: "VTEX_GET_CARD_TOKEN_BY_ID",
    description: "Get card token by ID.",
    annotations: { readOnlyHint: true },
    requestSchema: cardTokenVaultZod.zGetCardTokenByIdData,
    sdkFn: cardTokenVaultSdk.getCardTokenById as any,
  }),
  createToolFromOperation({
    id: "VTEX_IMPORT_CARD_TOKENS",
    description: "Import card tokens.",
    requestSchema: cardTokenVaultZod.zImportCardTokensData,
    sdkFn: cardTokenVaultSdk.importCardTokens as any,
  }),
  createToolFromOperation({
    id: "VTEX_GET_CARD_TOKEN_IMPORT_STATUS",
    description: "Get card token import status.",
    annotations: { readOnlyHint: true },
    requestSchema: cardTokenVaultZod.zGetCardTokenImportStatusData,
    sdkFn: cardTokenVaultSdk.getCardTokenImportStatus as any,
  }),
  createToolFromOperation({
    id: "VTEX_GET_CARD_TOKEN_IMPORT_REPORT",
    description: "Get card token import report.",
    annotations: { readOnlyHint: true },
    requestSchema: cardTokenVaultZod.zGetCardTokenImportReportData,
    sdkFn: cardTokenVaultSdk.getCardTokenImportReport as any,
  }),
];

// ── Catalog API Seller Portal ──────────────────────────────────────────────────
import * as catalogSellerPortalZod from "../generated/catalog-api-seller-portal/zod.gen.ts";
import * as catalogSellerPortalSdk from "../generated/catalog-api-seller-portal/sdk.gen.ts";

export const catalogSellerPortalTools = [
  createToolFromOperation({
    id: "VTEX_SELLER_PORTAL_GET_PRODUCT",
    description: "Get product by ID.",
    annotations: { readOnlyHint: true },
    requestSchema: catalogSellerPortalZod.zGetProductData,
    sdkFn: catalogSellerPortalSdk.getProduct as any,
  }),
  createToolFromOperation({
    id: "VTEX_SELLER_PORTAL_PUT_PRODUCT",
    description: "Update product.",
    requestSchema: catalogSellerPortalZod.zPutProductData,
    sdkFn: catalogSellerPortalSdk.putProduct as any,
  }),
  createToolFromOperation({
    id: "VTEX_SELLER_PORTAL_GET_PRODUCT_DESCRIPTION",
    description: "Get product description by product ID.",
    annotations: { readOnlyHint: true },
    requestSchema: catalogSellerPortalZod.zGetProductDescriptionData,
    sdkFn: catalogSellerPortalSdk.getProductDescription as any,
  }),
  createToolFromOperation({
    id: "VTEX_SELLER_PORTAL_PUT_PRODUCT_DESCRIPTION",
    description: "Update product description by product ID.",
    requestSchema: catalogSellerPortalZod.zPutProductDescriptionData,
    sdkFn: catalogSellerPortalSdk.putProductDescription as any,
  }),
  createToolFromOperation({
    id: "VTEX_SELLER_PORTAL_GET_PRODUCT_QUERY",
    description: "Get product by external ID, SKU ID, SKU external ID or slug.",
    annotations: { readOnlyHint: true },
    requestSchema: catalogSellerPortalZod.zGetProductQueryData,
    sdkFn: catalogSellerPortalSdk.getProductQuery as any,
  }),
  createToolFromOperation({
    id: "VTEX_SELLER_PORTAL_POST_PRODUCT",
    description: "Create product.",
    requestSchema: catalogSellerPortalZod.zPostProductData,
    sdkFn: catalogSellerPortalSdk.postProduct as any,
  }),
  createToolFromOperation({
    id: "VTEX_SELLER_PORTAL_SEARCH_SKU",
    description: "Search for SKU.",
    annotations: { readOnlyHint: true },
    requestSchema: catalogSellerPortalZod.zSearchSkuData,
    sdkFn: catalogSellerPortalSdk.searchSku as any,
  }),
  createToolFromOperation({
    id: "VTEX_SELLER_PORTAL_LIST_SKU",
    description: "Get list of SKUs.",
    annotations: { readOnlyHint: true },
    requestSchema: catalogSellerPortalZod.zListSkuData,
    sdkFn: catalogSellerPortalSdk.listSku as any,
  }),
  createToolFromOperation({
    id: "VTEX_SELLER_PORTAL_LIST_BRAND",
    description: "Get list of brands.",
    annotations: { readOnlyHint: true },
    requestSchema: catalogSellerPortalZod.zListBrandData,
    sdkFn: catalogSellerPortalSdk.listBrand as any,
  }),
  createToolFromOperation({
    id: "VTEX_SELLER_PORTAL_POST_BRAND",
    description: "Create brand.",
    requestSchema: catalogSellerPortalZod.zPostBrandData,
    sdkFn: catalogSellerPortalSdk.postBrand as any,
  }),
  createToolFromOperation({
    id: "VTEX_SELLER_PORTAL_GET_BRAND",
    description: "Get brand by ID.",
    annotations: { readOnlyHint: true },
    requestSchema: catalogSellerPortalZod.zGetBrandData,
    sdkFn: catalogSellerPortalSdk.getBrand as any,
  }),
  createToolFromOperation({
    id: "VTEX_SELLER_PORTAL_PUT_BRAND",
    description: "Update brand.",
    requestSchema: catalogSellerPortalZod.zPutBrandData,
    sdkFn: catalogSellerPortalSdk.putBrand as any,
  }),
  createToolFromOperation({
    id: "VTEX_SELLER_PORTAL_GET_CATEGORY_TREE",
    description: "Get category tree.",
    annotations: { readOnlyHint: true },
    requestSchema: catalogSellerPortalZod.zGetCategoryTreeData,
    sdkFn: catalogSellerPortalSdk.getCategoryTree as any,
  }),
  createToolFromOperation({
    id: "VTEX_SELLER_PORTAL_UPDATE_CATEGORY_TREE",
    description: "Update category tree.",
    requestSchema: catalogSellerPortalZod.zUpdateCategoryTreeData,
    sdkFn: catalogSellerPortalSdk.updateCategoryTree as any,
  }),
  createToolFromOperation({
    id: "VTEX_SELLER_PORTAL_GET_CATEGORY_BY_ID",
    description: "Get category by ID.",
    annotations: { readOnlyHint: true },
    requestSchema: catalogSellerPortalZod.zGetbyidData,
    sdkFn: catalogSellerPortalSdk.getbyid as any,
  }),
  createToolFromOperation({
    id: "VTEX_SELLER_PORTAL_CREATE_CATEGORY",
    description: "Create category.",
    requestSchema: catalogSellerPortalZod.zCreateCategoryData,
    sdkFn: catalogSellerPortalSdk.createCategory as any,
  }),
];

// ── Checkout ──────────────────────────────────────────────────────────────────
import * as checkoutZod from "../generated/checkout/zod.gen.ts";
import * as checkoutSdk from "../generated/checkout/sdk.gen.ts";

export const checkoutTools = [
  createToolFromOperation({
    id: "VTEX_CART_SIMULATION",
    description: "Cart simulation.",
    requestSchema: checkoutZod.zCartSimulationData,
    sdkFn: checkoutSdk.cartSimulation as any,
  }),
  createToolFromOperation({
    id: "VTEX_CREATE_A_NEW_CART",
    description: "Get current or create a new cart.",
    annotations: { readOnlyHint: true },
    requestSchema: checkoutZod.zCreateANewCartData,
    sdkFn: checkoutSdk.createANewCart as any,
  }),
  createToolFromOperation({
    id: "VTEX_GET_CART_INFORMATION_BY_ID",
    description: "Get cart information by ID.",
    annotations: { readOnlyHint: true },
    requestSchema: checkoutZod.zGetCartInformationByIdData,
    sdkFn: checkoutSdk.getCartInformationById as any,
  }),
  createToolFromOperation({
    id: "VTEX_REMOVE_ALL_ITEMS",
    description: "Remove all items from shopping cart.",
    annotations: { destructiveHint: true },
    requestSchema: checkoutZod.zRemoveAllItemsData,
    sdkFn: checkoutSdk.removeAllItems as any,
  }),
  createToolFromOperation({
    id: "VTEX_REMOVEALLPERSONALDATA",
    description: "Remove all personal data from shopping cart.",
    annotations: { destructiveHint: true },
    requestSchema: checkoutZod.zRemoveallpersonaldataData,
    sdkFn: checkoutSdk.removeallpersonaldata as any,
  }),
  createToolFromOperation({
    id: "VTEX_ITEMS_UPDATE",
    description: "Update cart items.",
    requestSchema: checkoutZod.zItemsUpdateData,
    sdkFn: checkoutSdk.itemsUpdate as any,
  }),
  createToolFromOperation({
    id: "VTEX_ITEMS_HANDLE",
    description: "Handle cart items.",
    requestSchema: checkoutZod.zItemsHandleData,
    sdkFn: checkoutSdk.itemsHandle as any,
  }),
  createToolFromOperation({
    id: "VTEX_ADD_CART_ITEMS",
    description: "Add cart items.",
    requestSchema: checkoutZod.zItemsData,
    sdkFn: checkoutSdk.items as any,
  }),
  createToolFromOperation({
    id: "VTEX_PRICE_CHANGE",
    description: "Change price of an SKU in a cart.",
    requestSchema: checkoutZod.zPriceChangeData,
    sdkFn: checkoutSdk.priceChange as any,
  }),
  createToolFromOperation({
    id: "VTEX_IGNORE_PROFILE_DATA",
    description: "Ignore profile data on checkout.",
    requestSchema: checkoutZod.zIgnoreProfileDataData,
    sdkFn: checkoutSdk.ignoreProfileData as any,
  }),
  createToolFromOperation({
    id: "VTEX_GET_CLIENT_PROFILE_BY_EMAIL",
    description: "Get client profile by email.",
    annotations: { readOnlyHint: true },
    requestSchema: checkoutZod.zGetClientProfileByEmailData,
    sdkFn: checkoutSdk.getClientProfileByEmail as any,
  }),
  createToolFromOperation({
    id: "VTEX_ADD_CLIENT_PROFILE",
    description: "Add client profile.",
    requestSchema: checkoutZod.zAddClientProfileData,
    sdkFn: checkoutSdk.addClientProfile as any,
  }),
  createToolFromOperation({
    id: "VTEX_ADD_SHIPPING_ADDRESS",
    description: "Add shipping address and select delivery option.",
    requestSchema: checkoutZod.zAddShippingAddressData,
    sdkFn: checkoutSdk.addShippingAddress as any,
  }),
  createToolFromOperation({
    id: "VTEX_ADD_CLIENT_PREFERENCES",
    description: "Add client preferences.",
    requestSchema: checkoutZod.zAddClientPreferencesData,
    sdkFn: checkoutSdk.addClientPreferences as any,
  }),
  createToolFromOperation({
    id: "VTEX_ADD_MARKETING_DATA",
    description: "Add marketing data.",
    requestSchema: checkoutZod.zAddMarketingDataData,
    sdkFn: checkoutSdk.addMarketingData as any,
  }),
  createToolFromOperation({
    id: "VTEX_ADD_PAYMENT_DATA",
    description: "Add payment data.",
    requestSchema: checkoutZod.zAddPaymentDataData,
    sdkFn: checkoutSdk.addPaymentData as any,
  }),
  createToolFromOperation({
    id: "VTEX_ADD_MERCHANT_CONTEXT_DATA",
    description: "Add merchant context data.",
    requestSchema: checkoutZod.zAddMerchantContextDataData,
    sdkFn: checkoutSdk.addMerchantContextData as any,
  }),
  createToolFromOperation({
    id: "VTEX_POST_CHECKOUT_ORDER_FORM_INVOICE_DATA",
    description: "Attach invoice data.",
    requestSchema:
      checkoutZod.zPostApiCheckoutPubOrderFormByOrderFormIdAttachmentsInvoiceDataData,
    sdkFn:
      checkoutSdk.postApiCheckoutPubOrderFormByOrderFormIdAttachmentsInvoiceData as any,
  }),
  createToolFromOperation({
    id: "VTEX_SET_MULTIPLE_CUSTOM_FIELD_VALUES",
    description: "Set multiple custom field values.",
    requestSchema: checkoutZod.zSetMultipleCustomFieldValuesData,
    sdkFn: checkoutSdk.setMultipleCustomFieldValues as any,
  }),
  createToolFromOperation({
    id: "VTEX_REMOVESINGLECUSTOMFIELDVALUE",
    description: "Remove single custom field value.",
    annotations: { destructiveHint: true },
    requestSchema: checkoutZod.zRemovesinglecustomfieldvalueData,
    sdkFn: checkoutSdk.removesinglecustomfieldvalue as any,
  }),
  createToolFromOperation({
    id: "VTEX_SET_SINGLE_CUSTOM_FIELD_VALUE",
    description: "Set single custom field value.",
    requestSchema: checkoutZod.zSetSingleCustomFieldValueData,
    sdkFn: checkoutSdk.setSingleCustomFieldValue as any,
  }),
  createToolFromOperation({
    id: "VTEX_PUT_CHECKOUT_ORDER_FORM_CUSTOM_FIELDS",
    description: "Batch add custom fields.",
    requestSchema:
      checkoutZod.zPutApiCheckoutPubOrderFormByOrderFormIdCustomFieldsData,
    sdkFn:
      checkoutSdk.putApiCheckoutPubOrderFormByOrderFormIdCustomFields as any,
  }),
  createToolFromOperation({
    id: "VTEX_PUT_CHECKOUT_ORDER_FORM_CUSTOM_FIELDS_ORDER",
    description: "Add order custom field.",
    requestSchema:
      checkoutZod.zPutApiCheckoutPubOrderFormByOrderFormIdCustomFieldsOrderData,
    sdkFn:
      checkoutSdk.putApiCheckoutPubOrderFormByOrderFormIdCustomFieldsOrder as any,
  }),
  createToolFromOperation({
    id: "VTEX_DELETE_CHECKOUT_ORDER_FORM_CUSTOM_FIELDS_ITEM",
    description: "Remove item custom field.",
    annotations: { destructiveHint: true },
    requestSchema:
      checkoutZod.zDeleteApiCheckoutPubOrderFormByOrderFormIdCustomFieldsItemByItemIdData,
    sdkFn:
      checkoutSdk.deleteApiCheckoutPubOrderFormByOrderFormIdCustomFieldsItemByItemId as any,
  }),
  createToolFromOperation({
    id: "VTEX_PUT_CHECKOUT_ORDER_FORM_CUSTOM_FIELDS_ITEM",
    description: "Add item custom field.",
    requestSchema:
      checkoutZod.zPutApiCheckoutPubOrderFormByOrderFormIdCustomFieldsItemByItemIdData,
    sdkFn:
      checkoutSdk.putApiCheckoutPubOrderFormByOrderFormIdCustomFieldsItemByItemId as any,
  }),
  createToolFromOperation({
    id: "VTEX_PUT_CHECKOUT_ORDER_FORM_CUSTOM_FIELDS_ADDRESS",
    description: "Add address custom field.",
    requestSchema:
      checkoutZod.zPutApiCheckoutPubOrderFormByOrderFormIdCustomFieldsAddressByAddressIdData,
    sdkFn:
      checkoutSdk.putApiCheckoutPubOrderFormByOrderFormIdCustomFieldsAddressByAddressId as any,
  }),
  createToolFromOperation({
    id: "VTEX_GETORDER_FORM_CONFIGURATION",
    description: "Get order form configuration.",
    annotations: { readOnlyHint: true },
    requestSchema: checkoutZod.zGetorderFormconfigurationData,
    sdkFn: checkoutSdk.getorderFormconfiguration as any,
  }),
  createToolFromOperation({
    id: "VTEX_UPDATEORDER_FORM_CONFIGURATION",
    description: "Update order form configuration.",
    requestSchema: checkoutZod.zUpdateorderFormconfigurationData,
    sdkFn: checkoutSdk.updateorderFormconfiguration as any,
  }),
  createToolFromOperation({
    id: "VTEX_GET_WINDOW_TO_CHANGE_SELLER",
    description: "Get window to change seller.",
    annotations: { readOnlyHint: true },
    requestSchema: checkoutZod.zGetWindowToChangeSellerData,
    sdkFn: checkoutSdk.getWindowToChangeSeller as any,
  }),
  createToolFromOperation({
    id: "VTEX_UPDATE_WINDOW_TO_CHANGE_SELLER",
    description: "Update window to change seller.",
    requestSchema: checkoutZod.zUpdateWindowToChangeSellerData,
    sdkFn: checkoutSdk.updateWindowToChangeSeller as any,
  }),
  createToolFromOperation({
    id: "VTEX_CLEARORDER_FORM_MESSAGES",
    description: "Clear order form messages.",
    requestSchema: checkoutZod.zClearorderFormMessagesData,
    sdkFn: checkoutSdk.clearorderFormMessages as any,
  }),
  createToolFromOperation({
    id: "VTEX_GET_CART_INSTALLMENTS",
    description: "Cart installments.",
    annotations: { readOnlyHint: true },
    requestSchema: checkoutZod.zGetCartInstallmentsData,
    sdkFn: checkoutSdk.getCartInstallments as any,
  }),
  createToolFromOperation({
    id: "VTEX_ADD_COUPONS",
    description: "Add coupons to the cart.",
    requestSchema: checkoutZod.zAddCouponsData,
    sdkFn: checkoutSdk.addCoupons as any,
  }),
  createToolFromOperation({
    id: "VTEX_LIST_PICKUP_PPOINTS_BY_LOCATION",
    description: "List pickup points by location.",
    annotations: { readOnlyHint: true },
    requestSchema: checkoutZod.zListPickupPpointsByLocationData,
    sdkFn: checkoutSdk.listPickupPpointsByLocation as any,
  }),
  createToolFromOperation({
    id: "VTEX_GET_ADDRESS_BY_POSTAL_CODE",
    description: "Get address by postal code.",
    annotations: { readOnlyHint: true },
    requestSchema: checkoutZod.zGetAddressByPostalCodeData,
    sdkFn: checkoutSdk.getAddressByPostalCode as any,
  }),
  createToolFromOperation({
    id: "VTEX_PLACE_ORDER_FROM_EXISTING_ORDER_FORM",
    description: "Place order from an existing cart.",
    requestSchema: checkoutZod.zPlaceOrderFromExistingOrderFormData,
    sdkFn: checkoutSdk.placeOrderFromExistingOrderForm as any,
  }),
  createToolFromOperation({
    id: "VTEX_PLACE_ORDER",
    description: "Place order.",
    requestSchema: checkoutZod.zPlaceOrderData,
    sdkFn: checkoutSdk.placeOrder as any,
  }),
  createToolFromOperation({
    id: "VTEX_PROCESS_ORDER",
    description: "Process order.",
    requestSchema: checkoutZod.zProcessOrderData,
    sdkFn: checkoutSdk.processOrder as any,
  }),
  createToolFromOperation({
    id: "VTEX_GET_SELLERS_BY_REGION",
    description: "Get sellers by region or address.",
    annotations: { readOnlyHint: true },
    requestSchema: checkoutZod.zGetSellersByRegionData,
    sdkFn: checkoutSdk.getSellersByRegion as any,
  }),
];

// ── Custom Fields ─────────────────────────────────────────────────────────────
import * as customFieldsZod from "../generated/custom-fields/zod.gen.ts";
import * as customFieldsSdk from "../generated/custom-fields/sdk.gen.ts";

export const customFieldsTools = [
  createToolFromOperation({
    id: "VTEX_GET_CUSTOM_FIELD_SETTINGS_SEARCH",
    description: "Get custom field settings.",
    annotations: { readOnlyHint: true },
    requestSchema:
      customFieldsZod.zGetApiDataentitiesCustomFieldSettingsSearchData,
    sdkFn: customFieldsSdk.getApiDataentitiesCustomFieldSettingsSearch as any,
  }),
  createToolFromOperation({
    id: "VTEX_POST_CUSTOM_FIELD_SETTINGS_DOCUMENTS",
    description: "Create custom field settings.",
    requestSchema:
      customFieldsZod.zPostApiDataentitiesCustomFieldSettingsDocumentsData,
    sdkFn:
      customFieldsSdk.postApiDataentitiesCustomFieldSettingsDocuments as any,
  }),
  createToolFromOperation({
    id: "VTEX_DELETE_CUSTOM_FIELD_SETTINGS_DOCUMENT",
    description: "Delete custom field setting.",
    annotations: { destructiveHint: true },
    requestSchema:
      customFieldsZod.zDeleteApiDataentitiesCustomFieldSettingsDocumentsByDocumentIdData,
    sdkFn:
      customFieldsSdk.deleteApiDataentitiesCustomFieldSettingsDocumentsByDocumentId as any,
  }),
  createToolFromOperation({
    id: "VTEX_PATCH_CUSTOM_FIELD_SETTINGS_DOCUMENT",
    description: "Update custom field settings.",
    requestSchema:
      customFieldsZod.zPatchApiDataentitiesCustomFieldSettingsDocumentsByDocumentIdData,
    sdkFn:
      customFieldsSdk.patchApiDataentitiesCustomFieldSettingsDocumentsByDocumentId as any,
  }),
  createToolFromOperation({
    id: "VTEX_POST_CUSTOM_FIELD_VALUES_DOCUMENTS",
    description: "Create custom field value.",
    requestSchema:
      customFieldsZod.zPostApiDataentitiesCustomFieldValuesDocumentsData,
    sdkFn: customFieldsSdk.postApiDataentitiesCustomFieldValuesDocuments as any,
  }),
  createToolFromOperation({
    id: "VTEX_DELETE_CUSTOM_FIELD_VALUE",
    description: "Delete custom field value.",
    annotations: { destructiveHint: true },
    requestSchema:
      customFieldsZod.zDeleteApiDataentitiesCustomFieldValuesDocumentsByCustomFieldValueIdData,
    sdkFn:
      customFieldsSdk.deleteApiDataentitiesCustomFieldValuesDocumentsByCustomFieldValueId as any,
  }),
  createToolFromOperation({
    id: "VTEX_GET_CUSTOM_FIELD_VALUE",
    description: "Get custom field value.",
    annotations: { readOnlyHint: true },
    requestSchema:
      customFieldsZod.zGetApiDataentitiesCustomFieldValuesDocumentsByCustomFieldValueIdData,
    sdkFn:
      customFieldsSdk.getApiDataentitiesCustomFieldValuesDocumentsByCustomFieldValueId as any,
  }),
  createToolFromOperation({
    id: "VTEX_PATCH_CUSTOM_FIELD_VALUE",
    description: "Update custom field value.",
    requestSchema:
      customFieldsZod.zPatchApiDataentitiesCustomFieldValuesDocumentsByCustomFieldValueIdData,
    sdkFn:
      customFieldsSdk.patchApiDataentitiesCustomFieldValuesDocumentsByCustomFieldValueId as any,
  }),
  createToolFromOperation({
    id: "VTEX_GET_CUSTOM_FIELD_VALUES_SEARCH",
    description: "Search custom field values.",
    annotations: { readOnlyHint: true },
    requestSchema:
      customFieldsZod.zGetApiDataentitiesCustomFieldValuesSearchData,
    sdkFn: customFieldsSdk.getApiDataentitiesCustomFieldValuesSearch as any,
  }),
];

// ── Customer Credit ────────────────────────────────────────────────────────────
import * as customerCreditZod from "../generated/customer-credit/zod.gen.ts";
import * as customerCreditSdk from "../generated/customer-credit/sdk.gen.ts";

export const customerCreditTools = [
  createToolFromOperation({
    id: "VTEX_SEARCHALLINVOICES",
    description: "Search all invoices.",
    annotations: { readOnlyHint: true },
    requestSchema: customerCreditZod.zSearchallinvoicesData,
    sdkFn: customerCreditSdk.searchallinvoices as any,
  }),
  createToolFromOperation({
    id: "VTEX_CANCEL_INVOICE",
    description: "Cancel invoice.",
    annotations: { destructiveHint: true },
    requestSchema: customerCreditZod.zCancelInvoiceData,
    sdkFn: customerCreditSdk.cancelInvoice as any,
  }),
  createToolFromOperation({
    id: "VTEX_RETRIEVE_INVOICE_BY_ID",
    description: "Retrieve invoice by ID.",
    annotations: { readOnlyHint: true },
    requestSchema: customerCreditZod.zRetrieveInvoicebyIdData,
    sdkFn: customerCreditSdk.retrieveInvoicebyId as any,
  }),
  createToolFromOperation({
    id: "VTEX_CHANGE_INVOICE",
    description: "Change invoice.",
    requestSchema: customerCreditZod.zChangeInvoiceData,
    sdkFn: customerCreditSdk.changeInvoice as any,
  }),
  createToolFromOperation({
    id: "VTEX_SEARCHALLINVOICESOFAACCOUNT",
    description: "Retrieve invoices by Customer Credit account ID.",
    annotations: { readOnlyHint: true },
    requestSchema: customerCreditZod.zSearchallinvoicesofaAccountData,
    sdkFn: customerCreditSdk.searchallinvoicesofaAccount as any,
  }),
  createToolFromOperation({
    id: "VTEX_MARK_INVOICE_AS_PAID",
    description: "Mark an invoice as paid.",
    requestSchema: customerCreditZod.zMarkaninvoiceasPaidData,
    sdkFn: customerCreditSdk.markaninvoiceasPaid as any,
  }),
  createToolFromOperation({
    id: "VTEX_POSTPONE_INVOICE",
    description: "Postpone an invoice.",
    requestSchema: customerCreditZod.zPostponeaninvoiceData,
    sdkFn: customerCreditSdk.postponeaninvoice as any,
  }),
  createToolFromOperation({
    id: "VTEX_SEARCHALLACCOUNTS",
    description: "Search all accounts.",
    annotations: { readOnlyHint: true },
    requestSchema: customerCreditZod.zSearchallaccountsData,
    sdkFn: customerCreditSdk.searchallaccounts as any,
  }),
  createToolFromOperation({
    id: "VTEX_OPEN_ACCOUNT",
    description: "Open an account.",
    requestSchema: customerCreditZod.zOpenanAccountData,
    sdkFn: customerCreditSdk.openanAccount as any,
  }),
  createToolFromOperation({
    id: "VTEX_CLOSE_ACCOUNT",
    description: "Close an account.",
    annotations: { destructiveHint: true },
    requestSchema: customerCreditZod.zCloseanAccountData,
    sdkFn: customerCreditSdk.closeanAccount as any,
  }),
  createToolFromOperation({
    id: "VTEX_RETRIEVE_ACCOUNT_BY_ID",
    description: "Retrieve an account by ID.",
    annotations: { readOnlyHint: true },
    requestSchema: customerCreditZod.zRetrieveaAccountbyIdData,
    sdkFn: customerCreditSdk.retrieveaAccountbyId as any,
  }),
  createToolFromOperation({
    id: "VTEX_UPDATE_ACCOUNT_INFO",
    description: "Update account information.",
    requestSchema: customerCreditZod.zUpdateemailanddescriptionofaaccountData,
    sdkFn: customerCreditSdk.updateemailanddescriptionofaaccount as any,
  }),
  createToolFromOperation({
    id: "VTEX_ACCOUNT_STATEMENTS",
    description: "Get account statements.",
    annotations: { readOnlyHint: true },
    requestSchema: customerCreditZod.zAccountstatementsData,
    sdkFn: customerCreditSdk.accountstatements as any,
  }),
  createToolFromOperation({
    id: "VTEX_CHANGE_CREDIT_LIMIT",
    description: "Change credit limit of an account.",
    requestSchema: customerCreditZod.zChangecreditlimitofanAccountData,
    sdkFn: customerCreditSdk.changecreditlimitofanAccount as any,
  }),
  createToolFromOperation({
    id: "VTEX_DECREASE_BALANCE",
    description: "Decrease balance of an account.",
    requestSchema: customerCreditZod.zDecreasebalanceofanaccountData,
    sdkFn: customerCreditSdk.decreasebalanceofanaccount as any,
  }),
  createToolFromOperation({
    id: "VTEX_CREATE_OR_UPDATE_SETTLEMENT",
    description: "Create or update settlement.",
    requestSchema: customerCreditZod.zCreateorUpdateSettlementData,
    sdkFn: customerCreditSdk.createorUpdateSettlement as any,
  }),
  createToolFromOperation({
    id: "VTEX_CREATE_PRE_AUTHORIZATION",
    description: "Create a pre-authorization.",
    requestSchema: customerCreditZod.zCreateaPreAuthorizationData,
    sdkFn: customerCreditSdk.createaPreAuthorization as any,
  }),
  createToolFromOperation({
    id: "VTEX_CANCEL_PRE_AUTHORIZATION",
    description: "Cancel a pre-authorization.",
    annotations: { destructiveHint: true },
    requestSchema: customerCreditZod.zCancelaPreAuthorizationData,
    sdkFn: customerCreditSdk.cancelaPreAuthorization as any,
  }),
  createToolFromOperation({
    id: "VTEX_UPDATE_PRE_AUTHORIZATION",
    description: "Update a pre-authorization.",
    requestSchema: customerCreditZod.zCreateaPreAuthorizationUsingidData,
    sdkFn: customerCreditSdk.createaPreAuthorizationUsingid as any,
  }),
  createToolFromOperation({
    id: "VTEX_ADD_ACCOUNT_HOLDER",
    description: "Add an account holder.",
    requestSchema: customerCreditZod.zAddanaccountHolderData,
    sdkFn: customerCreditSdk.addanaccountHolder as any,
  }),
  createToolFromOperation({
    id: "VTEX_DELETE_ACCOUNT_HOLDER",
    description: "Delete an account holder.",
    annotations: { destructiveHint: true },
    requestSchema: customerCreditZod.zDeleteanaccountholderData,
    sdkFn: customerCreditSdk.deleteanaccountholder as any,
  }),
  createToolFromOperation({
    id: "VTEX_CHANGE_TOLERANCE",
    description: "Change tolerance of an account.",
    requestSchema: customerCreditZod.zChangetoleranceofanaccountData,
    sdkFn: customerCreditSdk.changetoleranceofanaccount as any,
  }),
  createToolFromOperation({
    id: "VTEX_PARTIAL_OR_TOTAL_REFUND_SETTLEMENT",
    description: "Partially or totally refund a settlement.",
    requestSchema: customerCreditZod.zPartialorTotalRefundaSettlementData,
    sdkFn: customerCreditSdk.partialorTotalRefundaSettlement as any,
  }),
  createToolFromOperation({
    id: "VTEX_RETRIEVE_STORE_CONFIGURATION",
    description: "Retrieve store configuration.",
    annotations: { readOnlyHint: true },
    requestSchema: customerCreditZod.zRetrievestoreconfigurationData,
    sdkFn: customerCreditSdk.retrievestoreconfiguration as any,
  }),
  createToolFromOperation({
    id: "VTEX_CREATE_OR_CHANGE_STORE_CONFIGURATION",
    description: "Create or change store configuration.",
    requestSchema: customerCreditZod.zCreateorchangestoreconfigurationData,
    sdkFn: customerCreditSdk.createorchangestoreconfiguration as any,
  }),
];

// ── Checkout Custom Card Payment ──────────────────────────────────────────────
import * as checkoutCustomCardPaymentZod from "../generated/checkout-custom-card-payment/zod.gen.ts";
import * as checkoutCustomCardPaymentSdk from "../generated/checkout-custom-card-payment/sdk.gen.ts";

export const checkoutCustomCardPaymentTools = [
  createToolFromOperation({
    id: "VTEX_POST_API_PROFILE_SYSTEM_PVT_PROFILES",
    description: "Create a customer profile.",
    requestSchema:
      checkoutCustomCardPaymentZod.zPostApiProfileSystemPvtProfilesData,
    sdkFn: checkoutCustomCardPaymentSdk.postApiProfileSystemPvtProfiles as any,
  }),
  createToolFromOperation({
    id: "VTEX_POST_API_CARD_TOKEN_VAULT_TOKENS",
    description: "Create a card token in the vault.",
    requestSchema:
      checkoutCustomCardPaymentZod.zPostApiCardTokenVaultTokensData,
    sdkFn: checkoutCustomCardPaymentSdk.postApiCardTokenVaultTokens as any,
  }),
  createToolFromOperation({
    id: "VTEX_POST_CHECKOUT_ORDER_FORM_ITEMS",
    description: "Add items to an order form.",
    requestSchema:
      checkoutCustomCardPaymentZod.zPostApiCheckoutPubOrderFormByOrderFormIdItemsData,
    sdkFn:
      checkoutCustomCardPaymentSdk.postApiCheckoutPubOrderFormByOrderFormIdItems as any,
  }),
  createToolFromOperation({
    id: "VTEX_POST_CHECKOUT_CLIENT_PROFILE_DATA",
    description: "Add client profile data to an order form.",
    requestSchema:
      checkoutCustomCardPaymentZod.zPostApiCheckoutPubOrderFormByOrderFormIdAttachmentsClientProfileDataData,
    sdkFn:
      checkoutCustomCardPaymentSdk.postApiCheckoutPubOrderFormByOrderFormIdAttachmentsClientProfileData as any,
  }),
  createToolFromOperation({
    id: "VTEX_POST_VTEXID_AUTHENTICATION_STARTLOGIN",
    description: "Start login flow for VTEX ID.",
    requestSchema:
      checkoutCustomCardPaymentZod.zPostApiVtexidPubAuthenticationStartloginData,
    sdkFn:
      checkoutCustomCardPaymentSdk.postApiVtexidPubAuthenticationStartlogin as any,
  }),
  createToolFromOperation({
    id: "VTEX_POST_VTEXID_AUTHENTICATION_CLASSIC_VALIDATE",
    description: "Validate classic authentication credentials.",
    requestSchema:
      checkoutCustomCardPaymentZod.zPostApiVtexidPubAuthenticationClassicValidateData,
    sdkFn:
      checkoutCustomCardPaymentSdk.postApiVtexidPubAuthenticationClassicValidate as any,
  }),
  createToolFromOperation({
    id: "VTEX_POST_CHECKOUT_PAYMENT_DATA",
    description: "Add payment data to an order form.",
    requestSchema:
      checkoutCustomCardPaymentZod.zPostApiCheckoutPubOrderFormByOrderFormIdAttachmentsPaymentDataData,
    sdkFn:
      checkoutCustomCardPaymentSdk.postApiCheckoutPubOrderFormByOrderFormIdAttachmentsPaymentData as any,
  }),
  createToolFromOperation({
    id: "VTEX_POST_CHECKOUT_TRANSACTION",
    description: "Create a transaction for an order form.",
    requestSchema:
      checkoutCustomCardPaymentZod.zPostApiCheckoutPubOrderFormByOrderFormIdTransactionData,
    sdkFn:
      checkoutCustomCardPaymentSdk.postApiCheckoutPubOrderFormByOrderFormIdTransaction as any,
  }),
  createToolFromOperation({
    id: "VTEX_GET_PVT_TRANSACTION_BY_ID",
    description: "Get transaction details by ID.",
    annotations: { readOnlyHint: true },
    requestSchema:
      checkoutCustomCardPaymentZod.zGetApiPvtTransactionsByTransactionIdData,
    sdkFn:
      checkoutCustomCardPaymentSdk.getApiPvtTransactionsByTransactionId as any,
  }),
  createToolFromOperation({
    id: "VTEX_GET_PVT_TRANSACTION_PAYMENTS",
    description: "Get payments of a transaction.",
    annotations: { readOnlyHint: true },
    requestSchema:
      checkoutCustomCardPaymentZod.zGetApiPvtTransactionsByTransactionIdPaymentsData,
    sdkFn:
      checkoutCustomCardPaymentSdk.getApiPvtTransactionsByTransactionIdPayments as any,
  }),
  createToolFromOperation({
    id: "VTEX_GET_PVT_ACCOUNT_BY_ID",
    description: "Get account details by ID.",
    annotations: { readOnlyHint: true },
    requestSchema:
      checkoutCustomCardPaymentZod.zGetApiPvtAccountsByAccountIdData,
    sdkFn: checkoutCustomCardPaymentSdk.getApiPvtAccountsByAccountId as any,
  }),
  createToolFromOperation({
    id: "VTEX_GET_PROFILE_VCS_CHECKOUT",
    description: "Get profile VCS checkout data.",
    annotations: { readOnlyHint: true },
    requestSchema:
      checkoutCustomCardPaymentZod.zGetApiProfileSystemPvtProfilesByProfileIdVcsCheckoutData,
    sdkFn:
      checkoutCustomCardPaymentSdk.getApiProfileSystemPvtProfilesByProfileIdVcsCheckout as any,
  }),
  createToolFromOperation({
    id: "VTEX_DELETE_PROFILE_PERSONAL_DATA",
    description: "Delete personal data from a profile.",
    annotations: { destructiveHint: true },
    requestSchema:
      checkoutCustomCardPaymentZod.zDeleteApiProfileSystemPvtProfilesByProfileIdPersonalDataData,
    sdkFn:
      checkoutCustomCardPaymentSdk.deleteApiProfileSystemPvtProfilesByProfileIdPersonalData as any,
  }),
];

// ── Data Subject Rights ────────────────────────────────────────────────────────
import * as dataSubjectRightsZod from "../generated/data-subject-rights/zod.gen.ts";
import * as dataSubjectRightsSdk from "../generated/data-subject-rights/sdk.gen.ts";

export const dataSubjectRightsTools = [
  createToolFromOperation({
    id: "VTEX_POST_USER_RIGHTS_DELETE_USER_DATA",
    description:
      "Create and process a request to delete user data (GDPR/LGPD compliance).",
    requestSchema:
      dataSubjectRightsZod.zPostApiUserRightsCreateAndProcessDeleteUserDataData,
    sdkFn:
      dataSubjectRightsSdk.postApiUserRightsCreateAndProcessDeleteUserData as any,
  }),
];

// ── Default Values ─────────────────────────────────────────────────────────────
import * as defaultValuesZod from "../generated/default-values/zod.gen.ts";
import * as defaultValuesSdk from "../generated/default-values/sdk.gen.ts";

export const defaultValuesTools = [
  createToolFromOperation({
    id: "VTEX_POST_DEFAULT_VALUES_DOCUMENT",
    description: "Create a default values document.",
    requestSchema:
      defaultValuesZod.zPostApiDataentitiesDefaultValuesDocumentsData,
    sdkFn: defaultValuesSdk.postApiDataentitiesDefaultValuesDocuments as any,
  }),
  createToolFromOperation({
    id: "VTEX_DELETE_DEFAULT_VALUES_DOCUMENT",
    description: "Delete a default values document by unit ID.",
    annotations: { destructiveHint: true },
    requestSchema:
      defaultValuesZod.zDeleteApiDataentitiesDefaultValuesDocumentsByUnitIdData,
    sdkFn:
      defaultValuesSdk.deleteApiDataentitiesDefaultValuesDocumentsByUnitId as any,
  }),
  createToolFromOperation({
    id: "VTEX_GET_DEFAULT_VALUES_DOCUMENT",
    description: "Get a default values document by unit ID.",
    annotations: { readOnlyHint: true },
    requestSchema:
      defaultValuesZod.zGetApiDataentitiesDefaultValuesDocumentsByUnitIdData,
    sdkFn:
      defaultValuesSdk.getApiDataentitiesDefaultValuesDocumentsByUnitId as any,
  }),
  createToolFromOperation({
    id: "VTEX_PATCH_DEFAULT_VALUES_DOCUMENT",
    description: "Update a default values document by unit ID.",
    requestSchema:
      defaultValuesZod.zPatchApiDataentitiesDefaultValuesDocumentsByUnitIdData,
    sdkFn:
      defaultValuesSdk.patchApiDataentitiesDefaultValuesDocumentsByUnitId as any,
  }),
];

// ── Delivery Promise Notification ─────────────────────────────────────────────
import * as deliveryPromiseNotificationZod from "../generated/delivery-promise-notification/zod.gen.ts";
import * as deliveryPromiseNotificationSdk from "../generated/delivery-promise-notification/sdk.gen.ts";

export const deliveryPromiseNotificationTools = [
  createToolFromOperation({
    id: "VTEX_PUT_DELIVERY_PROMISES_SELLER_PRODUCTS",
    description: "Update delivery promise products for an external seller.",
    requestSchema:
      deliveryPromiseNotificationZod.zPutDeliveryPromisesExternalSellersBySellerIdProductsData,
    sdkFn:
      deliveryPromiseNotificationSdk.putDeliveryPromisesExternalSellersBySellerIdProducts as any,
  }),
  createToolFromOperation({
    id: "VTEX_PATCH_DELIVERY_PROMISES_SELLER_ITEM",
    description:
      "Update a specific item delivery promise for an external seller.",
    requestSchema:
      deliveryPromiseNotificationZod.zPatchDeliveryPromisesExternalSellersBySellerIdItemsByItemIdData,
    sdkFn:
      deliveryPromiseNotificationSdk.patchDeliveryPromisesExternalSellersBySellerIdItemsByItemId as any,
  }),
];

// ── Gift Card ──────────────────────────────────────────────────────────────────
import * as giftcardZod from "../generated/giftcard/zod.gen.ts";
import * as giftcardSdk from "../generated/giftcard/sdk.gen.ts";

export const giftcardTools = [
  createToolFromOperation({
    id: "VTEX_CREATE_GIFT_CARD",
    description: "Create a gift card.",
    requestSchema: giftcardZod.zCreateGiftCardData,
    sdkFn: giftcardSdk.createGiftCard as any,
  }),
  createToolFromOperation({
    id: "VTEX_GET_GIFT_CARD_BY_ID",
    description: "Get a gift card by ID.",
    annotations: { readOnlyHint: true },
    requestSchema: giftcardZod.zGetGiftCardbyIdData,
    sdkFn: giftcardSdk.getGiftCardbyId as any,
  }),
  createToolFromOperation({
    id: "VTEX_SEARCH_GIFT_CARDS_FROM_CART_DATA",
    description: "Search gift cards applicable from cart data.",
    requestSchema: giftcardZod.zSearchGiftCardsfromcartdataData,
    sdkFn: giftcardSdk.searchGiftCardsfromcartdata as any,
  }),
  createToolFromOperation({
    id: "VTEX_GET_GIFT_CARD_TRANSACTIONS",
    description: "Get all transactions for a gift card.",
    annotations: { readOnlyHint: true },
    requestSchema: giftcardZod.zGetGiftCardTransactionsData,
    sdkFn: giftcardSdk.getGiftCardTransactions as any,
  }),
  createToolFromOperation({
    id: "VTEX_CREATE_GIFT_CARD_TRANSACTION",
    description: "Create a transaction for a gift card.",
    requestSchema: giftcardZod.zCreateGiftCardTransactionData,
    sdkFn: giftcardSdk.createGiftCardTransaction as any,
  }),
  createToolFromOperation({
    id: "VTEX_GET_GIFT_CARD_TRANSACTION_BY_ID",
    description: "Get a gift card transaction by ID.",
    annotations: { readOnlyHint: true },
    requestSchema: giftcardZod.zGetGiftCardTransactionbyIdData,
    sdkFn: giftcardSdk.getGiftCardTransactionbyId as any,
  }),
  createToolFromOperation({
    id: "VTEX_GET_GIFT_CARD_TRANSACTION_AUTHORIZATIONS",
    description: "Get authorization transactions for a gift card.",
    annotations: { readOnlyHint: true },
    requestSchema: giftcardZod.zGetTransactionAuthorizationsData,
    sdkFn: giftcardSdk.getTransactionAuthorizations as any,
  }),
  createToolFromOperation({
    id: "VTEX_GET_GIFT_CARD_TRANSACTION_CANCELLATIONS",
    description: "Get cancellation transactions for a gift card.",
    annotations: { readOnlyHint: true },
    requestSchema: giftcardZod.zGetTransactionCancellationsData,
    sdkFn: giftcardSdk.getTransactionCancellations as any,
  }),
  createToolFromOperation({
    id: "VTEX_CANCEL_GIFT_CARD_TRANSACTION",
    description: "Cancel a gift card transaction.",
    annotations: { destructiveHint: true },
    requestSchema: giftcardZod.zCancelGiftCardTransactionData,
    sdkFn: giftcardSdk.cancelGiftCardTransaction as any,
  }),
  createToolFromOperation({
    id: "VTEX_GET_GIFT_CARD_TRANSACTION_SETTLEMENTS",
    description: "Get settlement transactions for a gift card.",
    annotations: { readOnlyHint: true },
    requestSchema: giftcardZod.zGetTransactionSettlementsData,
    sdkFn: giftcardSdk.getTransactionSettlements as any,
  }),
  createToolFromOperation({
    id: "VTEX_SETTLE_GIFT_CARD_TRANSACTION",
    description: "Settle a gift card transaction.",
    requestSchema: giftcardZod.zSettleGiftCardTransactionData,
    sdkFn: giftcardSdk.settleGiftCardTransaction as any,
  }),
];

// ── Gift Card Hub ──────────────────────────────────────────────────────────────
import * as giftcardHubZod from "../generated/giftcard-hub/zod.gen.ts";
import * as giftcardHubSdk from "../generated/giftcard-hub/sdk.gen.ts";

export const giftcardHubTools = [
  createToolFromOperation({
    id: "VTEX_LIST_ALL_GIFT_CARD_PROVIDERS",
    description: "List all registered gift card providers.",
    annotations: { readOnlyHint: true },
    requestSchema: giftcardHubZod.zListAllGiftCardProvidersData,
    sdkFn: giftcardHubSdk.listAllGiftCardProviders as any,
  }),
  createToolFromOperation({
    id: "VTEX_DELETE_GIFT_CARD_PROVIDER_BY_ID",
    description: "Delete a gift card provider by ID.",
    annotations: { destructiveHint: true },
    requestSchema: giftcardHubZod.zDeleteGiftCardProviderbyIdData,
    sdkFn: giftcardHubSdk.deleteGiftCardProviderbyId as any,
  }),
  createToolFromOperation({
    id: "VTEX_GET_GIFT_CARD_PROVIDER_BY_ID",
    description: "Get a gift card provider by ID.",
    annotations: { readOnlyHint: true },
    requestSchema: giftcardHubZod.zGetGiftCardProviderbyIdData,
    sdkFn: giftcardHubSdk.getGiftCardProviderbyId as any,
  }),
  createToolFromOperation({
    id: "VTEX_CREATE_UPDATE_GIFT_CARD_PROVIDER_BY_ID",
    description: "Create or update a gift card provider by ID.",
    requestSchema: giftcardHubZod.zCreateUpdateGiftCardProviderbyIdData,
    sdkFn: giftcardHubSdk.createUpdateGiftCardProviderbyId as any,
  }),
  createToolFromOperation({
    id: "VTEX_CREATE_GIFT_CARD_IN_PROVIDER",
    description: "Create a gift card in a specific provider.",
    requestSchema: giftcardHubZod.zCreateGiftCardinGiftCardProviderData,
    sdkFn: giftcardHubSdk.createGiftCardinGiftCardProvider as any,
  }),
  createToolFromOperation({
    id: "VTEX_GET_GIFT_CARD_FROM_PROVIDER",
    description: "Get a gift card from a provider using cart data.",
    requestSchema: giftcardHubZod.zGetGiftCardfromGiftCardProviderData,
    sdkFn: giftcardHubSdk.getGiftCardfromGiftCardProvider as any,
  }),
  createToolFromOperation({
    id: "VTEX_GET_GIFT_CARD_FROM_PROVIDER_BY_ID",
    description: "Get a gift card from a provider by ID.",
    annotations: { readOnlyHint: true },
    requestSchema: giftcardHubZod.zGetGiftCardfromGiftCardProviderbyIdData,
    sdkFn: giftcardHubSdk.getGiftCardfromGiftCardProviderbyId as any,
  }),
  createToolFromOperation({
    id: "VTEX_LIST_ALL_GIFT_CARD_HUB_TRANSACTIONS",
    description: "List all gift card transactions via hub.",
    annotations: { readOnlyHint: true },
    requestSchema: giftcardHubZod.zListAllGiftCardTransactionsData,
    sdkFn: giftcardHubSdk.listAllGiftCardTransactions as any,
  }),
  createToolFromOperation({
    id: "VTEX_CREATE_GIFT_CARD_HUB_TRANSACTION",
    description: "Create a gift card transaction via hub.",
    requestSchema: giftcardHubZod.zCreateGiftCardTransactionData,
    sdkFn: giftcardHubSdk.createGiftCardTransaction as any,
  }),
  createToolFromOperation({
    id: "VTEX_GET_GIFT_CARD_HUB_TRANSACTION_BY_ID",
    description: "Get a gift card transaction by ID via hub.",
    annotations: { readOnlyHint: true },
    requestSchema: giftcardHubZod.zGetGiftCardTransactionbyIdData,
    sdkFn: giftcardHubSdk.getGiftCardTransactionbyId as any,
  }),
  createToolFromOperation({
    id: "VTEX_GET_GIFT_CARD_HUB_AUTHORIZATION_TRANSACTION",
    description: "Get authorization transaction for a gift card via hub.",
    annotations: { readOnlyHint: true },
    requestSchema: giftcardHubZod.zGetGiftCardAuthorizationTransactionData,
    sdkFn: giftcardHubSdk.getGiftCardAuthorizationTransaction as any,
  }),
  createToolFromOperation({
    id: "VTEX_LIST_GIFT_CARD_HUB_SETTLEMENT_TRANSACTIONS",
    description: "List all settlement transactions for a gift card via hub.",
    annotations: { readOnlyHint: true },
    requestSchema: giftcardHubZod.zListAllGiftCardSettlementTransactionsData,
    sdkFn: giftcardHubSdk.listAllGiftCardSettlementTransactions as any,
  }),
  createToolFromOperation({
    id: "VTEX_CREATE_GIFT_CARD_HUB_SETTLEMENT_TRANSACTION",
    description: "Create a settlement transaction for a gift card via hub.",
    requestSchema: giftcardHubZod.zCreateGiftCardSettlementTransactionData,
    sdkFn: giftcardHubSdk.createGiftCardSettlementTransaction as any,
  }),
  createToolFromOperation({
    id: "VTEX_LIST_GIFT_CARD_HUB_CANCELLATION_TRANSACTIONS",
    description: "List all cancellation transactions for a gift card via hub.",
    annotations: { readOnlyHint: true },
    requestSchema: giftcardHubZod.zListAllGiftCardCancellationTransactionsData,
    sdkFn: giftcardHubSdk.listAllGiftCardCancellationTransactions as any,
  }),
  createToolFromOperation({
    id: "VTEX_CREATE_GIFT_CARD_HUB_CANCELLATION_TRANSACTION",
    description: "Create a cancellation transaction for a gift card via hub.",
    requestSchema: giftcardHubZod.zCreateGiftCardCancellationTransactionData,
    sdkFn: giftcardHubSdk.createGiftCardCancellationTransaction as any,
  }),
];

// ── Gift Card Provider Protocol ────────────────────────────────────────────────
import * as giftcardProviderProtocolZod from "../generated/giftcard-provider-protocol/zod.gen.ts";
import * as giftcardProviderProtocolSdk from "../generated/giftcard-provider-protocol/sdk.gen.ts";

export const giftcardProviderProtocolTools = [
  createToolFromOperation({
    id: "VTEX_GC_PROVIDER_LIST_ALL_GIFT_CARDS",
    description: "List all gift cards from a provider.",
    requestSchema: giftcardProviderProtocolZod.zListAllGiftCardsData,
    sdkFn: giftcardProviderProtocolSdk.listAllGiftCards as any,
  }),
  createToolFromOperation({
    id: "VTEX_GC_PROVIDER_GET_GIFT_CARD_BY_ID",
    description: "Get a gift card by ID from a provider.",
    annotations: { readOnlyHint: true },
    requestSchema: giftcardProviderProtocolZod.zGetGiftCardbyIdData,
    sdkFn: giftcardProviderProtocolSdk.getGiftCardbyId as any,
  }),
  createToolFromOperation({
    id: "VTEX_GC_PROVIDER_CREATE_GIFT_CARD",
    description: "Create a gift card in the provider.",
    requestSchema: giftcardProviderProtocolZod.zCreateGiftCardData,
    sdkFn: giftcardProviderProtocolSdk.createGiftCard as any,
  }),
  createToolFromOperation({
    id: "VTEX_GC_PROVIDER_LIST_ALL_TRANSACTIONS",
    description: "List all gift card transactions from a provider.",
    annotations: { readOnlyHint: true },
    requestSchema: giftcardProviderProtocolZod.zListAllGiftCardTransactionsData,
    sdkFn: giftcardProviderProtocolSdk.listAllGiftCardTransactions as any,
  }),
  createToolFromOperation({
    id: "VTEX_GC_PROVIDER_CREATE_TRANSACTION",
    description: "Create a gift card transaction in the provider.",
    requestSchema: giftcardProviderProtocolZod.zCreateGiftCardTransactionData,
    sdkFn: giftcardProviderProtocolSdk.createGiftCardTransaction as any,
  }),
  createToolFromOperation({
    id: "VTEX_GC_PROVIDER_GET_TRANSACTION_BY_ID",
    description: "Get a gift card transaction by ID from the provider.",
    annotations: { readOnlyHint: true },
    requestSchema: giftcardProviderProtocolZod.zGetGiftCardTransactionbyIdData,
    sdkFn: giftcardProviderProtocolSdk.getGiftCardTransactionbyId as any,
  }),
  createToolFromOperation({
    id: "VTEX_GC_PROVIDER_GET_TRANSACTION_AUTHORIZATION",
    description: "Get the authorization of a gift card transaction.",
    annotations: { readOnlyHint: true },
    requestSchema:
      giftcardProviderProtocolZod.zGetGiftCardTransactionAuthorizationData,
    sdkFn:
      giftcardProviderProtocolSdk.getGiftCardTransactionAuthorization as any,
  }),
  createToolFromOperation({
    id: "VTEX_GC_PROVIDER_LIST_TRANSACTION_CANCELLATIONS",
    description: "List all cancellations for a gift card transaction.",
    annotations: { readOnlyHint: true },
    requestSchema:
      giftcardProviderProtocolZod.zListAllGiftCardTransactionsCancellationsData,
    sdkFn:
      giftcardProviderProtocolSdk.listAllGiftCardTransactionsCancellations as any,
  }),
  createToolFromOperation({
    id: "VTEX_GC_PROVIDER_CREATE_TRANSACTION_CANCELLATION",
    description: "Create a cancellation for a gift card transaction.",
    requestSchema:
      giftcardProviderProtocolZod.zCreateGiftCardTransactionCancellationData,
    sdkFn:
      giftcardProviderProtocolSdk.createGiftCardTransactionCancellation as any,
  }),
  createToolFromOperation({
    id: "VTEX_GC_PROVIDER_LIST_TRANSACTION_SETTLEMENTS",
    description: "List all settlements for a gift card transaction.",
    annotations: { readOnlyHint: true },
    requestSchema:
      giftcardProviderProtocolZod.zListAllGiftCardTransactionsSettlementsData,
    sdkFn:
      giftcardProviderProtocolSdk.listAllGiftCardTransactionsSettlements as any,
  }),
  createToolFromOperation({
    id: "VTEX_GC_PROVIDER_CREATE_TRANSACTION_SETTLEMENT",
    description: "Create a settlement for a gift card transaction.",
    requestSchema:
      giftcardProviderProtocolZod.zCreateGiftCardTransactionSettlementData,
    sdkFn:
      giftcardProviderProtocolSdk.createGiftCardTransactionSettlement as any,
  }),
];

// ── Headless CMS ───────────────────────────────────────────────────────────────
import * as headlessCmsZod from "../generated/headless-cms/zod.gen.ts";
import * as headlessCmsSdk from "../generated/headless-cms/sdk.gen.ts";

export const headlessCmsTools = [
  createToolFromOperation({
    id: "VTEX_GET_ALL_CMS_CONTENT_TYPES",
    description: "Get all content types registered in Headless CMS.",
    annotations: { readOnlyHint: true },
    requestSchema: headlessCmsZod.zGetAllContentTypesData,
    sdkFn: headlessCmsSdk.getAllContentTypes as any,
  }),
  createToolFromOperation({
    id: "VTEX_GET_CMS_PAGES_BY_CONTENT_TYPE",
    description: "Get pages by content type in Headless CMS.",
    annotations: { readOnlyHint: true },
    requestSchema: headlessCmsZod.zGetPagesbyContentTypeData,
    sdkFn: headlessCmsSdk.getPagesbyContentType as any,
  }),
  createToolFromOperation({
    id: "VTEX_GET_CMS_PAGE",
    description: "Get a specific CMS page by content type and document ID.",
    annotations: { readOnlyHint: true },
    requestSchema: headlessCmsZod.zGetCmSpageData,
    sdkFn: headlessCmsSdk.getCmSpage as any,
  }),
];

// ── Intelligent Search ─────────────────────────────────────────────────────────
import * as intelligentSearchZod from "../generated/intelligent-search/zod.gen.ts";
import * as intelligentSearchSdk from "../generated/intelligent-search/sdk.gen.ts";

export const intelligentSearchTools = [
  createToolFromOperation({
    id: "VTEX_IS_GET_TOP_SEARCHES",
    description: "Get list of the 10 most searched terms in the past 14 days.",
    annotations: { readOnlyHint: true },
    requestSchema: intelligentSearchZod.zGetTopSearchesData,
    sdkFn: intelligentSearchSdk.getTopSearches as any,
  }),
  createToolFromOperation({
    id: "VTEX_IS_GET_AUTOCOMPLETE_SUGGESTIONS",
    description:
      "Get list of suggested terms and attributes similar to the search term.",
    annotations: { readOnlyHint: true },
    requestSchema: intelligentSearchZod.zGetAutocompleteSuggestionsData,
    sdkFn: intelligentSearchSdk.getAutocompleteSuggestions as any,
  }),
  createToolFromOperation({
    id: "VTEX_IS_GET_CORRECTION_SEARCH",
    description: "Get attempted correction of a misspelled search term.",
    annotations: { readOnlyHint: true },
    requestSchema: intelligentSearchZod.zGetCorrectionSearchData,
    sdkFn: intelligentSearchSdk.getCorrectionSearch as any,
  }),
  createToolFromOperation({
    id: "VTEX_IS_GET_BANNERS_BY_FACETS",
    description: "Get list of banners registered for a search query.",
    annotations: { readOnlyHint: true },
    requestSchema: intelligentSearchZod.zGetBannersByFacetsData,
    sdkFn: intelligentSearchSdk.getBannersByFacets as any,
  }),
  createToolFromOperation({
    id: "VTEX_IS_GET_SEARCH_SUGGESTIONS",
    description: "Get search term suggestions.",
    annotations: { readOnlyHint: true },
    requestSchema: intelligentSearchZod.zGetSearchSuggestionsData,
    sdkFn: intelligentSearchSdk.getSearchSuggestions as any,
  }),
  createToolFromOperation({
    id: "VTEX_IS_GET_PRODUCT_SEARCH",
    description: "Search for products using Intelligent Search by facets.",
    annotations: { readOnlyHint: true },
    requestSchema: intelligentSearchZod.zGetProductSearchByFacetsData,
    sdkFn: intelligentSearchSdk.getProductSearchByFacets as any,
  }),
  createToolFromOperation({
    id: "VTEX_IS_GET_FACETS",
    description: "Get search facets for a given query.",
    annotations: { readOnlyHint: true },
    requestSchema: intelligentSearchZod.zGetFacetsByFacetsData,
    sdkFn: intelligentSearchSdk.getFacetsByFacets as any,
  }),
  createToolFromOperation({
    id: "VTEX_IS_GET_PICKUP_POINT_AVAILABILITY",
    description:
      "Get pickup point availability for product clusters and trade policy.",
    annotations: { readOnlyHint: true },
    requestSchema:
      intelligentSearchZod.zGetPickupPointAvailabilityProductClusterIdsByProductClusterIdsTradePolicyByTradePolicyData,
    sdkFn:
      intelligentSearchSdk.getPickupPointAvailabilityProductClusterIdsByProductClusterIdsTradePolicyByTradePolicy as any,
  }),
];

// ── Intelligent Search Events API (Headless) ───────────────────────────────────
import * as intelligentSearchEventsZod from "../generated/intelligent-search-events-api-headless/zod.gen.ts";
import * as intelligentSearchEventsSdk from "../generated/intelligent-search-events-api-headless/sdk.gen.ts";

export const intelligentSearchEventsTools = [
  createToolFromOperation({
    id: "VTEX_IS_POST_EVENT",
    description:
      "Send a search event (view, click, purchase, etc.) to Intelligent Search.",
    requestSchema: intelligentSearchEventsZod.zPostEventData,
    sdkFn: intelligentSearchEventsSdk.postEvent as any,
  }),
];

// ── Legacy CMS Portal ──────────────────────────────────────────────────────────
import * as legacyCmsPortalZod from "../generated/legacy-cms-portal/zod.gen.ts";
import * as legacyCmsPortalSdk from "../generated/legacy-cms-portal/sdk.gen.ts";

export const legacyCmsPortalTools = [
  createToolFromOperation({
    id: "VTEX_CMS_CHANGE_ENTIRE_ACCOUNT_ALL_WEBSITES",
    description: "Update CMS settings for all websites in the account.",
    requestSchema: legacyCmsPortalZod.zChangeentireaccountAllwebsitesData,
    sdkFn: legacyCmsPortalSdk.changeentireaccountAllwebsites as any,
  }),
  createToolFromOperation({
    id: "VTEX_CMS_CHANGE_SPECIFIC_WEBSITE",
    description: "Update CMS settings for a specific website.",
    requestSchema: legacyCmsPortalZod.zChangespecificwebsiteData,
    sdkFn: legacyCmsPortalSdk.changespecificwebsite as any,
  }),
];

// ── License Manager ────────────────────────────────────────────────────────────
import * as licenseManagerZod from "../generated/license-manager/zod.gen.ts";
import * as licenseManagerSdk from "../generated/license-manager/sdk.gen.ts";

export const licenseManagerTools = [
  createToolFromOperation({
    id: "VTEX_DELETE_LICENSE_MANAGER_USER",
    description: "Delete a user by user ID.",
    annotations: { destructiveHint: true },
    requestSchema: licenseManagerZod.zDeleteApiLicenseManagerUsersByUserIdData,
    sdkFn: licenseManagerSdk.deleteApiLicenseManagerUsersByUserId as any,
  }),
  createToolFromOperation({
    id: "VTEX_GET_LICENSE_MANAGER_USER",
    description: "Get a user by user ID.",
    annotations: { readOnlyHint: true },
    requestSchema: licenseManagerZod.zGetUserData,
    sdkFn: licenseManagerSdk.getUser as any,
  }),
  createToolFromOperation({
    id: "VTEX_CREATE_LICENSE_MANAGER_USER",
    description: "Create a new user.",
    requestSchema: licenseManagerZod.zCreateUserData,
    sdkFn: licenseManagerSdk.createUser as any,
  }),
  createToolFromOperation({
    id: "VTEX_GET_LIST_USERS",
    description: "Get list of users in the account.",
    annotations: { readOnlyHint: true },
    requestSchema: licenseManagerZod.zGetListUsersData,
    sdkFn: licenseManagerSdk.getListUsers as any,
  }),
  createToolFromOperation({
    id: "VTEX_GET_ROLES_BY_USER",
    description: "Get roles assigned to a user.",
    annotations: { readOnlyHint: true },
    requestSchema: licenseManagerZod.zGetRolesbyUserData,
    sdkFn: licenseManagerSdk.getRolesbyUser as any,
  }),
  createToolFromOperation({
    id: "VTEX_PUT_ROLES_IN_USER",
    description: "Assign roles to a user.",
    requestSchema: licenseManagerZod.zPutRolesinUserData,
    sdkFn: licenseManagerSdk.putRolesinUser as any,
  }),
  createToolFromOperation({
    id: "VTEX_GET_ROLES_BY_USER2",
    description: "Get roles assigned to a user (alternate endpoint).",
    annotations: { readOnlyHint: true },
    requestSchema: licenseManagerZod.zGetRolesbyUser2Data,
    sdkFn: licenseManagerSdk.getRolesbyUser2 as any,
  }),
  createToolFromOperation({
    id: "VTEX_REMOVE_ROLE_FROM_USER",
    description: "Remove a role from a user.",
    annotations: { destructiveHint: true },
    requestSchema: licenseManagerZod.zRemoveRolefromUserData,
    sdkFn: licenseManagerSdk.removeRolefromUser as any,
  }),
  createToolFromOperation({
    id: "VTEX_GET_LIST_ROLES",
    description: "Get list of all roles in the account.",
    annotations: { readOnlyHint: true },
    requestSchema: licenseManagerZod.zGetListRolesData,
    sdkFn: licenseManagerSdk.getListRoles as any,
  }),
  createToolFromOperation({
    id: "VTEX_GET_APP_KEYS_FROM_ACCOUNT",
    description: "Get all app keys from the account.",
    annotations: { readOnlyHint: true },
    requestSchema: licenseManagerZod.zGetappkeysfromaccountData,
    sdkFn: licenseManagerSdk.getappkeysfromaccount as any,
  }),
  createToolFromOperation({
    id: "VTEX_CREATE_NEW_APP_KEY",
    description: "Create a new app key.",
    requestSchema: licenseManagerZod.zCreatenewappkeyData,
    sdkFn: licenseManagerSdk.createnewappkey as any,
  }),
  createToolFromOperation({
    id: "VTEX_UPDATE_APP_KEY",
    description: "Update an existing app key.",
    requestSchema: licenseManagerZod.zUpdateappkeyData,
    sdkFn: licenseManagerSdk.updateappkey as any,
  }),
  createToolFromOperation({
    id: "VTEX_GET_LICENSE_MANAGER_BY_ACCOUNT",
    description: "Get license manager info for the account.",
    annotations: { readOnlyHint: true },
    requestSchema: licenseManagerZod.zGetByAccountData,
    sdkFn: licenseManagerSdk.getByAccount as any,
  }),
  createToolFromOperation({
    id: "VTEX_GET_LICENSE_MANAGER_ACCOUNT",
    description: "Get current account license manager details.",
    annotations: { readOnlyHint: true },
    requestSchema: licenseManagerZod.zGetAccountData,
    sdkFn: licenseManagerSdk.getAccount as any,
  }),
];

// ── Marketplace ────────────────────────────────────────────────────────────────
import * as marketplaceZod from "../generated/marketplace/zod.gen.ts";
import * as marketplaceSdk from "../generated/marketplace/sdk.gen.ts";

export const marketplaceTools = [
  createToolFromOperation({
    id: "VTEX_MARKETPLACE_PRICE_NOTIFICATION",
    description: "Notify marketplace of a price change.",
    requestSchema: marketplaceZod.zPriceNotificationData,
    sdkFn: marketplaceSdk.priceNotification as any,
  }),
  createToolFromOperation({
    id: "VTEX_MARKETPLACE_INVENTORY_NOTIFICATION",
    description: "Notify marketplace of an inventory change.",
    requestSchema: marketplaceZod.zInventoryNotificationData,
    sdkFn: marketplaceSdk.inventoryNotification as any,
  }),
  createToolFromOperation({
    id: "VTEX_MARKETPLACE_GET_OFFERS_LIST",
    description: "Get the list of offers in the marketplace.",
    annotations: { readOnlyHint: true },
    requestSchema: marketplaceZod.zGetofferslistData,
    sdkFn: marketplaceSdk.getofferslist as any,
  }),
  createToolFromOperation({
    id: "VTEX_MARKETPLACE_GET_SKU_OFFERS",
    description: "Get offers for a specific SKU.",
    annotations: { readOnlyHint: true },
    requestSchema: marketplaceZod.zGetSkUoffersData,
    sdkFn: marketplaceSdk.getSkUoffers as any,
  }),
  createToolFromOperation({
    id: "VTEX_MARKETPLACE_GET_PRODUCT_OFFERS",
    description: "Get offers for a specific product.",
    annotations: { readOnlyHint: true },
    requestSchema: marketplaceZod.zGetProductoffersData,
    sdkFn: marketplaceSdk.getProductoffers as any,
  }),
  createToolFromOperation({
    id: "VTEX_MARKETPLACE_LIST_SELLER_LEADS",
    description: "List seller leads.",
    annotations: { readOnlyHint: true },
    requestSchema: marketplaceZod.zListSellerLeadsData,
    sdkFn: marketplaceSdk.listSellerLeads as any,
  }),
  createToolFromOperation({
    id: "VTEX_MARKETPLACE_CREATE_SELLER_LEAD",
    description: "Create a new seller lead.",
    requestSchema: marketplaceZod.zCreateSellerLeadData,
    sdkFn: marketplaceSdk.createSellerLead as any,
  }),
  createToolFromOperation({
    id: "VTEX_MARKETPLACE_REMOVE_SELLER_LEAD",
    description: "Remove a seller lead.",
    annotations: { destructiveHint: true },
    requestSchema: marketplaceZod.zRemoveSellerLeadData,
    sdkFn: marketplaceSdk.removeSellerLead as any,
  }),
  createToolFromOperation({
    id: "VTEX_MARKETPLACE_RETRIEVE_SELLER_LEAD",
    description: "Retrieve a seller lead by ID.",
    annotations: { readOnlyHint: true },
    requestSchema: marketplaceZod.zRetrieveSellerLeadData,
    sdkFn: marketplaceSdk.retrieveSellerLead as any,
  }),
  createToolFromOperation({
    id: "VTEX_MARKETPLACE_ACCEPT_SELLER_LEAD",
    description: "Accept a seller lead.",
    requestSchema: marketplaceZod.zAcceptSellerLeadData,
    sdkFn: marketplaceSdk.acceptSellerLead as any,
  }),
  createToolFromOperation({
    id: "VTEX_MARKETPLACE_CREATE_SELLER_FROM_LEAD",
    description: "Create a seller from an accepted seller lead.",
    requestSchema: marketplaceZod.zCreateSellerFromSellerLeadData,
    sdkFn: marketplaceSdk.createSellerFromSellerLead as any,
  }),
  createToolFromOperation({
    id: "VTEX_MARKETPLACE_RESEND_SELLER_LEAD_REQUEST",
    description: "Resend a seller lead invitation request.",
    requestSchema: marketplaceZod.zResendSellerLeadRequestData,
    sdkFn: marketplaceSdk.resendSellerLeadRequest as any,
  }),
  createToolFromOperation({
    id: "VTEX_MARKETPLACE_LIST_SELLER_COMMISSIONS",
    description: "List all commissions for a seller.",
    annotations: { readOnlyHint: true },
    requestSchema: marketplaceZod.zListSellerCommissionsData,
    sdkFn: marketplaceSdk.listSellerCommissions as any,
  }),
  createToolFromOperation({
    id: "VTEX_MARKETPLACE_BULK_UPSERT_SELLER_COMMISSIONS",
    description: "Bulk create or update seller commissions.",
    requestSchema: marketplaceZod.zBulkUpsertSellerCommissionsData,
    sdkFn: marketplaceSdk.bulkUpsertSellerCommissions as any,
  }),
  createToolFromOperation({
    id: "VTEX_MARKETPLACE_REMOVE_SELLER_COMMISSIONS",
    description: "Remove seller commissions.",
    annotations: { destructiveHint: true },
    requestSchema: marketplaceZod.zRemoveSellerCommissionsData,
    sdkFn: marketplaceSdk.removeSellerCommissions as any,
  }),
  createToolFromOperation({
    id: "VTEX_MARKETPLACE_RETRIEVE_SELLER_COMMISSIONS",
    description: "Retrieve commissions for a specific seller.",
    annotations: { readOnlyHint: true },
    requestSchema: marketplaceZod.zRetrieveSellerCommissionsData,
    sdkFn: marketplaceSdk.retrieveSellerCommissions as any,
  }),
  createToolFromOperation({
    id: "VTEX_MARKETPLACE_GET_LIST_SELLERS",
    description: "Get the list of sellers in the marketplace.",
    annotations: { readOnlyHint: true },
    requestSchema: marketplaceZod.zGetListSellersData,
    sdkFn: marketplaceSdk.getListSellers as any,
  }),
  createToolFromOperation({
    id: "VTEX_MARKETPLACE_UPSERT_SELLER",
    description: "Create or update a seller.",
    requestSchema: marketplaceZod.zUpsertSellerRequestData,
    sdkFn: marketplaceSdk.upsertSellerRequest as any,
  }),
  createToolFromOperation({
    id: "VTEX_MARKETPLACE_GET_RETRIEVE_SELLER",
    description: "Retrieve a seller by ID.",
    annotations: { readOnlyHint: true },
    requestSchema: marketplaceZod.zGetRetrieveSellerData,
    sdkFn: marketplaceSdk.getRetrieveSeller as any,
  }),
  createToolFromOperation({
    id: "VTEX_MARKETPLACE_UPDATE_SELLER",
    description: "Update an existing seller.",
    requestSchema: marketplaceZod.zUpdateSellerData,
    sdkFn: marketplaceSdk.updateSeller as any,
  }),
  createToolFromOperation({
    id: "VTEX_MARKETPLACE_RETRIEVE_MAPPING",
    description: "Retrieve category mapping for a seller.",
    annotations: { readOnlyHint: true },
    requestSchema: marketplaceZod.zRetrieveMappingData,
    sdkFn: marketplaceSdk.retrieveMapping as any,
  }),
  createToolFromOperation({
    id: "VTEX_MARKETPLACE_UPSERT_MAPPING",
    description: "Create or update category mapping for a seller.",
    requestSchema: marketplaceZod.zUpsertMappingData,
    sdkFn: marketplaceSdk.upsertMapping as any,
  }),
  createToolFromOperation({
    id: "VTEX_MARKETPLACE_GET_FULFILLMENT_AFFILIATES",
    description: "Get fulfillment affiliates.",
    annotations: { readOnlyHint: true },
    requestSchema: marketplaceZod.zGetFulfillmentPvtAffiliatesData,
    sdkFn: marketplaceSdk.getFulfillmentPvtAffiliates as any,
  }),
  createToolFromOperation({
    id: "VTEX_MARKETPLACE_DELETE_FULFILLMENT_AFFILIATE",
    description: "Delete a fulfillment affiliate by ID.",
    annotations: { destructiveHint: true },
    requestSchema:
      marketplaceZod.zDeleteFulfillmentPvtAffiliatesByAffiliateIdData,
    sdkFn: marketplaceSdk.deleteFulfillmentPvtAffiliatesByAffiliateId as any,
  }),
  createToolFromOperation({
    id: "VTEX_MARKETPLACE_GET_FULFILLMENT_AFFILIATE",
    description: "Get a fulfillment affiliate by ID.",
    annotations: { readOnlyHint: true },
    requestSchema: marketplaceZod.zGetFulfillmentPvtAffiliatesByAffiliateIdData,
    sdkFn: marketplaceSdk.getFulfillmentPvtAffiliatesByAffiliateId as any,
  }),
  createToolFromOperation({
    id: "VTEX_MARKETPLACE_PUT_FULFILLMENT_AFFILIATE",
    description: "Create or update a fulfillment affiliate.",
    requestSchema: marketplaceZod.zPutFulfillmentPvtAffiliatesByAffiliateIdData,
    sdkFn: marketplaceSdk.putFulfillmentPvtAffiliatesByAffiliateId as any,
  }),
];

// ── Marketplace APIs: Sent Offers ──────────────────────────────────────────────
import * as marketplaceSentOffersZod from "../generated/marketplace-apis-sent-offers/zod.gen.ts";
import * as marketplaceSentOffersSdk from "../generated/marketplace-apis-sent-offers/sdk.gen.ts";

export const marketplaceSentOffersTools = [
  createToolFromOperation({
    id: "VTEX_SENT_OFFERS_CREATE_CHANNEL",
    description: "Create a channel for sent offers.",
    requestSchema: marketplaceSentOffersZod.zCreateChannelData,
    sdkFn: marketplaceSentOffersSdk.createChannel as any,
  }),
  createToolFromOperation({
    id: "VTEX_SENT_OFFERS_LIST_FEEDS",
    description: "List all feeds for sent offers.",
    annotations: { readOnlyHint: true },
    requestSchema: marketplaceSentOffersZod.zListFeedsData,
    sdkFn: marketplaceSentOffersSdk.listFeeds as any,
  }),
  createToolFromOperation({
    id: "VTEX_SENT_OFFERS_CREATE_FEED",
    description: "Create a feed for sent offers.",
    requestSchema: marketplaceSentOffersZod.zCreateFeedData,
    sdkFn: marketplaceSentOffersSdk.createFeed as any,
  }),
  createToolFromOperation({
    id: "VTEX_SENT_OFFERS_DELETE_FEED",
    description: "Delete a sent offers feed.",
    annotations: { destructiveHint: true },
    requestSchema: marketplaceSentOffersZod.zDeleteFeedData,
    sdkFn: marketplaceSentOffersSdk.deleteFeed as any,
  }),
  createToolFromOperation({
    id: "VTEX_SENT_OFFERS_RETRIEVE_FEED",
    description: "Retrieve a sent offers feed by ID.",
    annotations: { readOnlyHint: true },
    requestSchema: marketplaceSentOffersZod.zRetrieveFeedData,
    sdkFn: marketplaceSentOffersSdk.retrieveFeed as any,
  }),
  createToolFromOperation({
    id: "VTEX_SENT_OFFERS_UPDATE_FEED",
    description: "Update a sent offers feed.",
    requestSchema: marketplaceSentOffersZod.zUpdateFeedData,
    sdkFn: marketplaceSentOffersSdk.updateFeed as any,
  }),
  createToolFromOperation({
    id: "VTEX_SENT_OFFERS_CREATE_INTERACTION",
    description: "Create an interaction in a sent offers feed.",
    requestSchema: marketplaceSentOffersZod.zCreateInteractionData,
    sdkFn: marketplaceSentOffersSdk.createInteraction as any,
  }),
  createToolFromOperation({
    id: "VTEX_SENT_OFFERS_RETRIEVE_INTERACTION",
    description: "Retrieve an interaction from a sent offers feed.",
    annotations: { readOnlyHint: true },
    requestSchema: marketplaceSentOffersZod.zRetrieveInteractionData,
    sdkFn: marketplaceSentOffersSdk.retrieveInteraction as any,
  }),
  createToolFromOperation({
    id: "VTEX_SENT_OFFERS_CLOSE_INTERACTION",
    description: "Close an interaction in a sent offers feed.",
    requestSchema: marketplaceSentOffersZod.zCloseInteractionData,
    sdkFn: marketplaceSentOffersSdk.closeInteraction as any,
  }),
  createToolFromOperation({
    id: "VTEX_SENT_OFFERS_CREATE_LOG",
    description: "Create a log entry in an interaction.",
    requestSchema: marketplaceSentOffersZod.zCreateLogData,
    sdkFn: marketplaceSentOffersSdk.createLog as any,
  }),
  createToolFromOperation({
    id: "VTEX_SENT_OFFERS_RETRIEVE_LOG",
    description: "Retrieve a log entry from an interaction.",
    annotations: { readOnlyHint: true },
    requestSchema: marketplaceSentOffersZod.zRetrieveLogData,
    sdkFn: marketplaceSentOffersSdk.retrieveLog as any,
  }),
  createToolFromOperation({
    id: "VTEX_SENT_OFFERS_SEARCH_INTERACTIONS",
    description: "Search interactions in sent offers.",
    annotations: { readOnlyHint: true },
    requestSchema: marketplaceSentOffersZod.zSearchInteractionsData,
    sdkFn: marketplaceSentOffersSdk.searchInteractions as any,
  }),
  createToolFromOperation({
    id: "VTEX_SENT_OFFERS_SEARCH_ERRORS",
    description: "Search errors in sent offers.",
    annotations: { readOnlyHint: true },
    requestSchema: marketplaceSentOffersZod.zSearchErrorsData,
    sdkFn: marketplaceSentOffersSdk.searchErrors as any,
  }),
  createToolFromOperation({
    id: "VTEX_SENT_OFFERS_RETRIEVE_ERROR_CODE",
    description: "Retrieve error details by error code.",
    annotations: { readOnlyHint: true },
    requestSchema: marketplaceSentOffersZod.zRetrieveErrorCodeData,
    sdkFn: marketplaceSentOffersSdk.retrieveErrorCode as any,
  }),
];

// ── Marketplace APIs: Suggestions ──────────────────────────────────────────────
import * as marketplaceSuggestionsZod from "../generated/marketplace-apis-suggestions/zod.gen.ts";
import * as marketplaceSuggestionsSdk from "../generated/marketplace-apis-suggestions/sdk.gen.ts";

export const marketplaceSuggestionsTools = [
  createToolFromOperation({
    id: "VTEX_SUGGESTIONS_GET_AUTO_APPROVE_VALUE",
    description: "Get auto-approve value from suggestions config.",
    annotations: { readOnlyHint: true },
    requestSchema: marketplaceSuggestionsZod.zGetautoApprovevaluefromconfigData,
    sdkFn: marketplaceSuggestionsSdk.getautoApprovevaluefromconfig as any,
  }),
  createToolFromOperation({
    id: "VTEX_SUGGESTIONS_SAVE_AUTO_APPROVE_FOR_ACCOUNT",
    description: "Save auto-approve setting for the account.",
    requestSchema: marketplaceSuggestionsZod.zSaveautoapproveforaccountData,
    sdkFn: marketplaceSuggestionsSdk.saveautoapproveforaccount as any,
  }),
  createToolFromOperation({
    id: "VTEX_SUGGESTIONS_GET_ACCOUNT_CONFIG",
    description: "Get suggestions account configuration.",
    annotations: { readOnlyHint: true },
    requestSchema: marketplaceSuggestionsZod.zGetaccountconfigData,
    sdkFn: marketplaceSuggestionsSdk.getaccountconfig as any,
  }),
  createToolFromOperation({
    id: "VTEX_SUGGESTIONS_SAVE_ACCOUNT_CONFIG",
    description: "Save suggestions account configuration.",
    requestSchema: marketplaceSuggestionsZod.zSaveaccountconfigData,
    sdkFn: marketplaceSuggestionsSdk.saveaccountconfig as any,
  }),
  createToolFromOperation({
    id: "VTEX_SUGGESTIONS_GET_MATCH_CONFIG",
    description: "Get match configuration for suggestions.",
    annotations: { readOnlyHint: true },
    requestSchema: marketplaceSuggestionsZod.zGetmatchconfigData,
    sdkFn: marketplaceSuggestionsSdk.getmatchconfig as any,
  }),
  createToolFromOperation({
    id: "VTEX_SUGGESTIONS_GET_SELLER_ACCOUNT_CONFIG",
    description: "Get seller account configuration for suggestions.",
    annotations: { readOnlyHint: true },
    requestSchema: marketplaceSuggestionsZod.zGetselleraccountconfigData,
    sdkFn: marketplaceSuggestionsSdk.getselleraccountconfig as any,
  }),
  createToolFromOperation({
    id: "VTEX_SUGGESTIONS_PUT_SELLER_ACCOUNT_CONFIG",
    description: "Update seller account configuration for suggestions.",
    requestSchema: marketplaceSuggestionsZod.zPutselleraccountconfigData,
    sdkFn: marketplaceSuggestionsSdk.putselleraccountconfig as any,
  }),
  createToolFromOperation({
    id: "VTEX_SUGGESTIONS_SAVE_AUTO_APPROVE_FOR_SELLER",
    description: "Save auto-approve setting for a specific seller.",
    requestSchema:
      marketplaceSuggestionsZod.zSaveautoapproveforaccountsellerData,
    sdkFn: marketplaceSuggestionsSdk.saveautoapproveforaccountseller as any,
  }),
  createToolFromOperation({
    id: "VTEX_SUGGESTIONS_GET_SUGGESTIONS",
    description: "Get list of product suggestions.",
    annotations: { readOnlyHint: true },
    requestSchema: marketplaceSuggestionsZod.zGetsuggestionsData,
    sdkFn: marketplaceSuggestionsSdk.getsuggestions as any,
  }),
  createToolFromOperation({
    id: "VTEX_SUGGESTIONS_DELETE_SUGGESTION",
    description: "Delete a product suggestion.",
    annotations: { destructiveHint: true },
    requestSchema: marketplaceSuggestionsZod.zDeleteSuggestionData,
    sdkFn: marketplaceSuggestionsSdk.deleteSuggestion as any,
  }),
  createToolFromOperation({
    id: "VTEX_SUGGESTIONS_GET_SUGGESTION",
    description: "Get a specific product suggestion.",
    annotations: { readOnlyHint: true },
    requestSchema: marketplaceSuggestionsZod.zGetSuggestionData,
    sdkFn: marketplaceSuggestionsSdk.getSuggestion as any,
  }),
  createToolFromOperation({
    id: "VTEX_SUGGESTIONS_SAVE_SUGGESTION",
    description: "Save a product suggestion.",
    requestSchema: marketplaceSuggestionsZod.zSaveSuggestionData,
    sdkFn: marketplaceSuggestionsSdk.saveSuggestion as any,
  }),
  createToolFromOperation({
    id: "VTEX_SUGGESTIONS_GET_VERSIONS",
    description: "Get versions of a product suggestion.",
    annotations: { readOnlyHint: true },
    requestSchema: marketplaceSuggestionsZod.zGetVersionsData,
    sdkFn: marketplaceSuggestionsSdk.getVersions as any,
  }),
  createToolFromOperation({
    id: "VTEX_SUGGESTIONS_GET_SUGGESTION_BY_VERSION",
    description: "Get a specific version of a product suggestion.",
    annotations: { readOnlyHint: true },
    requestSchema: marketplaceSuggestionsZod.zGetSuggestionbyversionData,
    sdkFn: marketplaceSuggestionsSdk.getSuggestionbyversion as any,
  }),
  createToolFromOperation({
    id: "VTEX_SUGGESTIONS_MATCH",
    description: "Match a product suggestion to an existing product.",
    requestSchema: marketplaceSuggestionsZod.zMatchData,
    sdkFn: marketplaceSuggestionsSdk.match as any,
  }),
  createToolFromOperation({
    id: "VTEX_SUGGESTIONS_MATCH_MULTIPLE",
    description: "Match multiple product suggestions at once.",
    requestSchema: marketplaceSuggestionsZod.zMatchMultipleData,
    sdkFn: marketplaceSuggestionsSdk.matchMultiple as any,
  }),
  createToolFromOperation({
    id: "VTEX_SUGGESTIONS_PUT_CONFIGURATION_SPECIFICATIONS",
    description: "Update suggestions configuration for seller specifications.",
    requestSchema:
      marketplaceSuggestionsZod.zPutSuggestionsConfigurationBySellerIdSpecificationsData,
    sdkFn:
      marketplaceSuggestionsSdk.putSuggestionsConfigurationBySellerIdSpecifications as any,
  }),
];

// ── Marketplace Protocol: External Marketplace Mapper ─────────────────────────
import * as mpMapperZod from "../generated/marketplace-protocol-external-marketplace-mapper/zod.gen.ts";
import * as mpMapperSdk from "../generated/marketplace-protocol-external-marketplace-mapper/sdk.gen.ts";

export const marketplaceProtocolMapperTools = [
  createToolFromOperation({
    id: "VTEX_MP_MAPPER_LIST_ALL_CHANNELS",
    description: "List all channels registered in the marketplace mapper.",
    annotations: { readOnlyHint: true },
    requestSchema: mpMapperZod.zListAllChannelsData,
    sdkFn: mpMapperSdk.listAllChannels as any,
  }),
  createToolFromOperation({
    id: "VTEX_MP_MAPPER_RETRIEVE_CHANNEL",
    description: "Retrieve a specific channel from the mapper.",
    annotations: { readOnlyHint: true },
    requestSchema: mpMapperZod.zRetrieveChannelData,
    sdkFn: mpMapperSdk.retrieveChannel as any,
  }),
  createToolFromOperation({
    id: "VTEX_MP_MAPPER_REGISTRATION",
    description: "Register a VTEX mapper connector.",
    requestSchema: mpMapperZod.zVtexMapperRegistrationData,
    sdkFn: mpMapperSdk.vtexMapperRegistration as any,
  }),
  createToolFromOperation({
    id: "VTEX_MP_MAPPER_SEND_CATEGORY_MAPPING",
    description: "Send category mapping to VTEX mapper.",
    requestSchema: mpMapperZod.zSendCategoryMappingVtexMapperData,
    sdkFn: mpMapperSdk.sendCategoryMappingVtexMapper as any,
  }),
  createToolFromOperation({
    id: "VTEX_MP_MAPPER_REGISTER_CONNECTOR",
    description: "Register a new connector.",
    requestSchema: mpMapperZod.zRegisterConnectorData,
    sdkFn: mpMapperSdk.registerConnector as any,
  }),
  createToolFromOperation({
    id: "VTEX_MP_MAPPER_LIST_ALL_CONNECTORS",
    description: "List all connectors.",
    annotations: { readOnlyHint: true },
    requestSchema: mpMapperZod.zListAllConnectorsData,
    sdkFn: mpMapperSdk.listAllConnectors as any,
  }),
  createToolFromOperation({
    id: "VTEX_MP_MAPPER_REMOVE_CONNECTOR",
    description: "Remove a connector.",
    annotations: { destructiveHint: true },
    requestSchema: mpMapperZod.zRemoveConnectorData,
    sdkFn: mpMapperSdk.removeConnector as any,
  }),
  createToolFromOperation({
    id: "VTEX_MP_MAPPER_RETRIEVE_CONNECTOR",
    description: "Retrieve a specific connector.",
    annotations: { readOnlyHint: true },
    requestSchema: mpMapperZod.zRetrieveConnectorData,
    sdkFn: mpMapperSdk.retrieveConnector as any,
  }),
  createToolFromOperation({
    id: "VTEX_MP_MAPPER_PARTIAL_UPDATE_CONNECTOR",
    description: "Partially update a connector.",
    requestSchema: mpMapperZod.zPartialUpdateConnectorData,
    sdkFn: mpMapperSdk.partialUpdateConnector as any,
  }),
  createToolFromOperation({
    id: "VTEX_MP_MAPPER_UPSERT_MERCHANT_CONNECTION",
    description: "Create or update a merchant connection.",
    requestSchema: mpMapperZod.zUpsertMerchantConnectionData,
    sdkFn: mpMapperSdk.upsertMerchantConnection as any,
  }),
  createToolFromOperation({
    id: "VTEX_MP_MAPPER_FULL_UPDATE_CONNECTOR",
    description: "Fully update a connector.",
    requestSchema: mpMapperZod.zFullUpdateConnectorData,
    sdkFn: mpMapperSdk.fullUpdateConnector as any,
  }),
];

// ── Marketplace Protocol: External Marketplace Orders ─────────────────────────
import * as mpOrdersZod from "../generated/marketplace-protocol-external-marketplace-orders/zod.gen.ts";
import * as mpOrdersSdk from "../generated/marketplace-protocol-external-marketplace-orders/sdk.gen.ts";

export const marketplaceProtocolOrdersTools = [
  createToolFromOperation({
    id: "VTEX_MP_PLACE_FULFILLMENT_ORDER",
    description: "Place a fulfillment order from the external marketplace.",
    requestSchema: mpOrdersZod.zPlaceFulfillmentOrderData,
    sdkFn: mpOrdersSdk.placeFulfillmentOrder as any,
  }),
  createToolFromOperation({
    id: "VTEX_MP_AUTHORIZE_DISPATCH_FOR_FULFILLMENT",
    description: "Authorize dispatch for a fulfillment order.",
    requestSchema: mpOrdersZod.zAuthorizeDispatchForFulfillmentOrderData,
    sdkFn: mpOrdersSdk.authorizeDispatchForFulfillmentOrder as any,
  }),
  createToolFromOperation({
    id: "VTEX_MP_ENQUEUE_NEW_ORDER",
    description: "Enqueue a new order from the external marketplace.",
    requestSchema: mpOrdersZod.zEnqueueNewOrderData,
    sdkFn: mpOrdersSdk.enqueueNewOrder as any,
  }),
  createToolFromOperation({
    id: "VTEX_MP_UPDATE_ORDER_STATUS",
    description: "Update the status of an order in the external marketplace.",
    requestSchema: mpOrdersZod.zUpdateOrderStatusData,
    sdkFn: mpOrdersSdk.updateOrderStatus as any,
  }),
  createToolFromOperation({
    id: "VTEX_MP_FULFILLMENT_SIMULATION",
    description: "Simulate fulfillment for the external marketplace.",
    requestSchema: mpOrdersZod.zFulfillmentSimulationExternalMarketplaceData,
    sdkFn: mpOrdersSdk.fulfillmentSimulationExternalMarketplace as any,
  }),
];

// ── Marketplace Protocol: External Seller Fulfillment ─────────────────────────
import * as mpSellerFulfillmentZod from "../generated/marketplace-protocol-external-seller-fulfillment/zod.gen.ts";
import * as mpSellerFulfillmentSdk from "../generated/marketplace-protocol-external-seller-fulfillment/sdk.gen.ts";

export const marketplaceProtocolSellerFulfillmentTools = [
  createToolFromOperation({
    id: "VTEX_MP_SELLER_FULFILLMENT_SIMULATION",
    description: "Simulate fulfillment for the external seller.",
    requestSchema: mpSellerFulfillmentZod.zFulfillmentSimulationData,
    sdkFn: mpSellerFulfillmentSdk.fulfillmentSimulation as any,
  }),
  createToolFromOperation({
    id: "VTEX_MP_SELLER_ORDER_PLACEMENT",
    description: "Place an order with the external seller.",
    requestSchema: mpSellerFulfillmentZod.zOrderPlacementData,
    sdkFn: mpSellerFulfillmentSdk.orderPlacement as any,
  }),
  createToolFromOperation({
    id: "VTEX_MP_SELLER_AUTHORIZE_FULFILLMENT",
    description: "Authorize fulfillment with the external seller.",
    requestSchema: mpSellerFulfillmentZod.zAuthorizeFulfillmentData,
    sdkFn: mpSellerFulfillmentSdk.authorizeFulfillment as any,
  }),
  createToolFromOperation({
    id: "VTEX_MP_SELLER_MKP_ORDER_CANCELLATION",
    description: "Cancel a marketplace order with the external seller.",
    annotations: { destructiveHint: true },
    requestSchema: mpSellerFulfillmentZod.zMkpOrderCancellationData,
    sdkFn: mpSellerFulfillmentSdk.mkpOrderCancellation as any,
  }),
];

// ── Marketplace Protocol: External Seller Marketplace ─────────────────────────
import * as mpSellerMarketplaceZod from "../generated/marketplace-protocol-external-seller-marketplace/zod.gen.ts";
import * as mpSellerMarketplaceSdk from "../generated/marketplace-protocol-external-seller-marketplace/sdk.gen.ts";

export const marketplaceProtocolSellerMarketplaceTools = [
  createToolFromOperation({
    id: "VTEX_MP_SELLER_SEND_INVOICE",
    description: "Send invoice information to the marketplace.",
    requestSchema: mpSellerMarketplaceZod.zSendInvoiceData,
    sdkFn: mpSellerMarketplaceSdk.sendInvoice as any,
  }),
  createToolFromOperation({
    id: "VTEX_MP_SELLER_SEND_TRACKING_INFORMATION",
    description: "Send tracking information to the marketplace.",
    requestSchema: mpSellerMarketplaceZod.zSendTrackingInformationData,
    sdkFn: mpSellerMarketplaceSdk.sendTrackingInformation as any,
  }),
  createToolFromOperation({
    id: "VTEX_MP_SELLER_UPDATE_TRACKING_STATUS",
    description: "Update order tracking status in the marketplace.",
    requestSchema: mpSellerMarketplaceZod.zUpdateTrackingStatusData,
    sdkFn: mpSellerMarketplaceSdk.updateTrackingStatus as any,
  }),
  createToolFromOperation({
    id: "VTEX_MP_SELLER_CANCEL_ORDER",
    description: "Cancel an order in the marketplace.",
    annotations: { destructiveHint: true },
    requestSchema: mpSellerMarketplaceZod.zCancelOrderInMarketplaceData,
    sdkFn: mpSellerMarketplaceSdk.cancelOrderInMarketplace as any,
  }),
  createToolFromOperation({
    id: "VTEX_MP_SELLER_SEND_AGREEMENT",
    description: "Send an agreement to the marketplace.",
    requestSchema: mpSellerMarketplaceZod.zSendAgreementData,
    sdkFn: mpSellerMarketplaceSdk.sendAgreement as any,
  }),
];

// ── Master Data API v2 ─────────────────────────────────────────────────────────
import * as masterDataV2Zod from "../generated/master-data-api-v2/zod.gen.ts";
import * as masterDataV2Sdk from "../generated/master-data-api-v2/sdk.gen.ts";

export const masterDataV2Tools = [
  createToolFromOperation({
    id: "VTEX_MDV2_CREATE_OR_UPDATE_PARTIAL_DOCUMENT",
    description: "Create or partially update a document in Master Data.",
    requestSchema: masterDataV2Zod.zCreateorupdatepartialdocumentData,
    sdkFn: masterDataV2Sdk.createorupdatepartialdocument as any,
  }),
  createToolFromOperation({
    id: "VTEX_MDV2_CREATE_NEW_DOCUMENT",
    description: "Create a new document in Master Data.",
    requestSchema: masterDataV2Zod.zCreatenewdocumentData,
    sdkFn: masterDataV2Sdk.createnewdocument as any,
  }),
  createToolFromOperation({
    id: "VTEX_MDV2_DELETE_DOCUMENT",
    description: "Delete a document from Master Data.",
    annotations: { destructiveHint: true },
    requestSchema: masterDataV2Zod.zDeletedocumentData,
    sdkFn: masterDataV2Sdk.deletedocument as any,
  }),
  createToolFromOperation({
    id: "VTEX_MDV2_GET_DOCUMENT",
    description: "Get a document from Master Data by ID.",
    annotations: { readOnlyHint: true },
    requestSchema: masterDataV2Zod.zGetdocumentData,
    sdkFn: masterDataV2Sdk.getdocument as any,
  }),
  createToolFromOperation({
    id: "VTEX_MDV2_UPDATE_PARTIAL_DOCUMENT",
    description: "Partially update a document in Master Data.",
    requestSchema: masterDataV2Zod.zUpdatepartialdocumentData,
    sdkFn: masterDataV2Sdk.updatepartialdocument as any,
  }),
  createToolFromOperation({
    id: "VTEX_MDV2_UPDATE_ENTIRE_DOCUMENT",
    description: "Fully replace a document in Master Data.",
    requestSchema: masterDataV2Zod.zUpdateentiredocumentData,
    sdkFn: masterDataV2Sdk.updateentiredocument as any,
  }),
  createToolFromOperation({
    id: "VTEX_MDV2_SEARCH_DOCUMENTS",
    description: "Search documents in Master Data.",
    annotations: { readOnlyHint: true },
    requestSchema: masterDataV2Zod.zSearchdocumentsData,
    sdkFn: masterDataV2Sdk.searchdocuments as any,
  }),
  createToolFromOperation({
    id: "VTEX_MDV2_SCROLL_DOCUMENTS",
    description: "Scroll through all documents in a Master Data entity.",
    annotations: { readOnlyHint: true },
    requestSchema: masterDataV2Zod.zScrolldocumentsData,
    sdkFn: masterDataV2Sdk.scrolldocuments as any,
  }),
  createToolFromOperation({
    id: "VTEX_MDV2_GET_SCHEMAS",
    description: "Get all schemas for a Master Data entity.",
    annotations: { readOnlyHint: true },
    requestSchema: masterDataV2Zod.zGetschemasData,
    sdkFn: masterDataV2Sdk.getschemas as any,
  }),
  createToolFromOperation({
    id: "VTEX_MDV2_DELETE_SCHEMA",
    description: "Delete a schema from a Master Data entity.",
    annotations: { destructiveHint: true },
    requestSchema: masterDataV2Zod.zDeleteschemabynameData,
    sdkFn: masterDataV2Sdk.deleteschemabyname as any,
  }),
  createToolFromOperation({
    id: "VTEX_MDV2_GET_SCHEMA",
    description: "Get a schema by name for a Master Data entity.",
    annotations: { readOnlyHint: true },
    requestSchema: masterDataV2Zod.zGetschemabynameData,
    sdkFn: masterDataV2Sdk.getschemabyname as any,
  }),
  createToolFromOperation({
    id: "VTEX_MDV2_SAVE_SCHEMA",
    description: "Save a schema for a Master Data entity.",
    requestSchema: masterDataV2Zod.zSaveschemabynameData,
    sdkFn: masterDataV2Sdk.saveschemabyname as any,
  }),
  createToolFromOperation({
    id: "VTEX_MDV2_GET_INDICES",
    description: "Get all indices for a Master Data entity.",
    annotations: { readOnlyHint: true },
    requestSchema: masterDataV2Zod.zGetindicesData,
    sdkFn: masterDataV2Sdk.getindices as any,
  }),
  createToolFromOperation({
    id: "VTEX_MDV2_PUT_INDICES",
    description: "Update indices for a Master Data entity.",
    requestSchema: masterDataV2Zod.zPutindicesData,
    sdkFn: masterDataV2Sdk.putindices as any,
  }),
  createToolFromOperation({
    id: "VTEX_MDV2_DELETE_INDEX",
    description: "Delete an index from a Master Data entity.",
    annotations: { destructiveHint: true },
    requestSchema: masterDataV2Zod.zDeleteindexbynameData,
    sdkFn: masterDataV2Sdk.deleteindexbyname as any,
  }),
  createToolFromOperation({
    id: "VTEX_MDV2_GET_INDEX",
    description: "Get an index by name from a Master Data entity.",
    annotations: { readOnlyHint: true },
    requestSchema: masterDataV2Zod.zGetindexbynameData,
    sdkFn: masterDataV2Sdk.getindexbyname as any,
  }),
  createToolFromOperation({
    id: "VTEX_MDV2_VALIDATE_DOCUMENT_BY_CLUSTERS",
    description: "Validate a document by clusters in Master Data.",
    requestSchema: masterDataV2Zod.zValidatedocumentbyclustersData,
    sdkFn: masterDataV2Sdk.validatedocumentbyclusters as any,
  }),
  createToolFromOperation({
    id: "VTEX_MDV2_LIST_VERSIONS",
    description: "List versions of a Master Data document.",
    annotations: { readOnlyHint: true },
    requestSchema: masterDataV2Zod.zListversionsData,
    sdkFn: masterDataV2Sdk.listversions as any,
  }),
  createToolFromOperation({
    id: "VTEX_MDV2_GET_VERSION",
    description: "Get a specific version of a Master Data document.",
    annotations: { readOnlyHint: true },
    requestSchema: masterDataV2Zod.zGetversionData,
    sdkFn: masterDataV2Sdk.getversion as any,
  }),
  createToolFromOperation({
    id: "VTEX_MDV2_PUT_VERSION",
    description: "Update a version of a Master Data document.",
    requestSchema: masterDataV2Zod.zPutversionData,
    sdkFn: masterDataV2Sdk.putversion as any,
  }),
];

// ── Master Data API v1 (v10-2 — older version) ────────────────────────────────
import * as masterDataV1Zod from "../generated/masterdata-api-v10-2/zod.gen.ts";
import * as masterDataV1Sdk from "../generated/masterdata-api-v10-2/sdk.gen.ts";

export const masterDataV1Tools = [
  createToolFromOperation({
    id: "VTEX_MDV1_LIST_DATA_ENTITIES",
    description: "List all data entities in Master Data v1.",
    annotations: { readOnlyHint: true },
    requestSchema: masterDataV1Zod.zListdataentitiesData,
    sdkFn: masterDataV1Sdk.listdataentities as any,
  }),
  createToolFromOperation({
    id: "VTEX_MDV1_GET_DATA_ENTITY_STRUCTURE",
    description: "Get the structure of a Master Data v1 data entity.",
    annotations: { readOnlyHint: true },
    requestSchema: masterDataV1Zod.zGetdataentitystructureData,
    sdkFn: masterDataV1Sdk.getdataentitystructure as any,
  }),
  createToolFromOperation({
    id: "VTEX_MDV1_CREATE_OR_UPDATE_PARTIAL_DOCUMENT",
    description: "Create or partially update a document in Master Data v1.",
    requestSchema: masterDataV1Zod.zCreateorupdatepartialdocumentData,
    sdkFn: masterDataV1Sdk.createorupdatepartialdocument as any,
  }),
  createToolFromOperation({
    id: "VTEX_MDV1_CREATE_NEW_DOCUMENT",
    description: "Create a new document in Master Data v1.",
    requestSchema: masterDataV1Zod.zCreatenewdocumentData,
    sdkFn: masterDataV1Sdk.createnewdocument as any,
  }),
  createToolFromOperation({
    id: "VTEX_MDV1_DELETE_DOCUMENT",
    description: "Delete a document from Master Data v1.",
    annotations: { destructiveHint: true },
    requestSchema: masterDataV1Zod.zDeletedocumentData,
    sdkFn: masterDataV1Sdk.deletedocument as any,
  }),
  createToolFromOperation({
    id: "VTEX_MDV1_GET_DOCUMENT",
    description: "Get a document from Master Data v1 by ID.",
    annotations: { readOnlyHint: true },
    requestSchema: masterDataV1Zod.zGetdocumentData,
    sdkFn: masterDataV1Sdk.getdocument as any,
  }),
  createToolFromOperation({
    id: "VTEX_MDV1_UPDATE_PARTIAL_DOCUMENT",
    description: "Partially update a document in Master Data v1.",
    requestSchema: masterDataV1Zod.zUpdatepartialdocumentData,
    sdkFn: masterDataV1Sdk.updatepartialdocument as any,
  }),
  createToolFromOperation({
    id: "VTEX_MDV1_UPDATE_ENTIRE_DOCUMENT",
    description: "Fully replace a document in Master Data v1.",
    requestSchema: masterDataV1Zod.zUpdateentiredocumentData,
    sdkFn: masterDataV1Sdk.updateentiredocument as any,
  }),
  createToolFromOperation({
    id: "VTEX_MDV1_LIST_VERSIONS",
    description: "List versions of a Master Data v1 document.",
    annotations: { readOnlyHint: true },
    requestSchema: masterDataV1Zod.zListversionsData,
    sdkFn: masterDataV1Sdk.listversions as any,
  }),
  createToolFromOperation({
    id: "VTEX_MDV1_GET_VERSION",
    description: "Get a specific version of a Master Data v1 document.",
    annotations: { readOnlyHint: true },
    requestSchema: masterDataV1Zod.zGetversionData,
    sdkFn: masterDataV1Sdk.getversion as any,
  }),
  createToolFromOperation({
    id: "VTEX_MDV1_PUT_VERSION",
    description: "Update a version of a Master Data v1 document.",
    requestSchema: masterDataV1Zod.zPutversionData,
    sdkFn: masterDataV1Sdk.putversion as any,
  }),
  createToolFromOperation({
    id: "VTEX_MDV1_SCROLL_DOCUMENTS",
    description: "Scroll through all documents in a Master Data v1 entity.",
    annotations: { readOnlyHint: true },
    requestSchema: masterDataV1Zod.zScrolldocumentsData,
    sdkFn: masterDataV1Sdk.scrolldocuments as any,
  }),
  createToolFromOperation({
    id: "VTEX_MDV1_SEARCH_DOCUMENTS",
    description: "Search documents in Master Data v1.",
    annotations: { readOnlyHint: true },
    requestSchema: masterDataV1Zod.zSearchdocumentsData,
    sdkFn: masterDataV1Sdk.searchdocuments as any,
  }),
  createToolFromOperation({
    id: "VTEX_MDV1_RETRIEVE_ATTACHMENT",
    description: "Retrieve an attachment from a Master Data v1 document.",
    annotations: { readOnlyHint: true },
    requestSchema: masterDataV1Zod.zRetrieveattachmentData,
    sdkFn: masterDataV1Sdk.retrieveattachment as any,
  }),
  createToolFromOperation({
    id: "VTEX_MDV1_SAVE_ATTACHMENT",
    description: "Save an attachment to a Master Data v1 document.",
    requestSchema: masterDataV1Zod.zSaveattachmentData,
    sdkFn: masterDataV1Sdk.saveattachment as any,
  }),
  createToolFromOperation({
    id: "VTEX_MDV1_VALIDATE_DOCUMENT_BY_CLUSTERS",
    description: "Validate a document by clusters in Master Data v1.",
    requestSchema: masterDataV1Zod.zValidateDocumentbyClustersData,
    sdkFn: masterDataV1Sdk.validateDocumentbyClusters as any,
  }),
  createToolFromOperation({
    id: "VTEX_MDV1_PUT_SCORES",
    description: "Set scores for Master Data v1 documents.",
    requestSchema: masterDataV1Zod.zPutscoresData,
    sdkFn: masterDataV1Sdk.putscores as any,
  }),
  createToolFromOperation({
    id: "VTEX_MDV1_DELETE_SCORE_BY_FIELD",
    description: "Delete a score by field in Master Data v1.",
    annotations: { destructiveHint: true },
    requestSchema: masterDataV1Zod.zDeletescorebyfieldData,
    sdkFn: masterDataV1Sdk.deletescorebyfield as any,
  }),
  createToolFromOperation({
    id: "VTEX_MDV1_PUT_SCORE_BY_FIELD",
    description: "Set a score by field in Master Data v1.",
    requestSchema: masterDataV1Zod.zPutscorebyfieldData,
    sdkFn: masterDataV1Sdk.putscorebyfield as any,
  }),
  createToolFromOperation({
    id: "VTEX_MDV1_CREATE_NEW_CUSTOMER_PROFILE_V2",
    description: "Create a new customer profile using Master Data v1.",
    requestSchema: masterDataV1Zod.zCreateNewCustomerProfilev2Data,
    sdkFn: masterDataV1Sdk.createNewCustomerProfilev2 as any,
  }),
];

// ── Message Center ─────────────────────────────────────────────────────────────
import * as messageCenterZod from "../generated/message-center/zod.gen.ts";
import * as messageCenterSdk from "../generated/message-center/sdk.gen.ts";

export const messageCenterTools = [
  createToolFromOperation({
    id: "VTEX_CREATE_DKIM",
    description: "Create DKIM keys for an email domain.",
    requestSchema: messageCenterZod.zCreateDkimData,
    sdkFn: messageCenterSdk.createDkim as any,
  }),
];

// ── mTLS ──────────────────────────────────────────────────────────────────────
import * as mtlsZod from "../generated/mtls/zod.gen.ts";
import * as mtlsSdk from "../generated/mtls/sdk.gen.ts";

export const mtlsTools = [
  createToolFromOperation({
    id: "VTEX_MTLS_SIGN_PRIVATE_CERTIFICATE",
    description: "Sign a private certificate for mTLS.",
    requestSchema: mtlsZod.zPostApiEdgePrivateCertificatesSignData,
    sdkFn: mtlsSdk.postApiEdgePrivateCertificatesSign as any,
  }),
  createToolFromOperation({
    id: "VTEX_MTLS_DELETE_PRIVATE_CERTIFICATE",
    description: "Delete a private certificate by serial number.",
    annotations: { destructiveHint: true },
    requestSchema: mtlsZod.zDeleteApiEdgePrivateCertificatesBySerialNumberData,
    sdkFn: mtlsSdk.deleteApiEdgePrivateCertificatesBySerialNumber as any,
  }),
];

// ── Operational Capacity ───────────────────────────────────────────────────────
import * as operationalCapacityZod from "../generated/operational-capacity/zod.gen.ts";
import * as operationalCapacitySdk from "../generated/operational-capacity/sdk.gen.ts";

export const operationalCapacityTools = [
  createToolFromOperation({
    id: "VTEX_GET_FULFILLMENT_LOCATIONS_CAPACITY",
    description: "Get operational capacity for fulfillment locations.",
    annotations: { readOnlyHint: true },
    requestSchema:
      operationalCapacityZod.zGetApiFulfillmentLocationsCapacityByParentAccountNameData,
    sdkFn:
      operationalCapacitySdk.getApiFulfillmentLocationsCapacityByParentAccountName as any,
  }),
  createToolFromOperation({
    id: "VTEX_PUT_FULFILLMENT_LOCATION_CAPACITY",
    description: "Update capacity for a specific fulfillment location.",
    requestSchema:
      operationalCapacityZod.zPutApiFulfillmentLocationsLocationByLocationIdCapacitiesByCodeData,
    sdkFn:
      operationalCapacitySdk.putApiFulfillmentLocationsLocationByLocationIdCapacitiesByCode as any,
  }),
  createToolFromOperation({
    id: "VTEX_GET_FULFILLMENT_LOCATION_CAPACITIES",
    description: "Get all capacities for a fulfillment location.",
    annotations: { readOnlyHint: true },
    requestSchema:
      operationalCapacityZod.zGetApiFulfillmentLocationsLocationsByLocationIdCapacitiesData,
    sdkFn:
      operationalCapacitySdk.getApiFulfillmentLocationsLocationsByLocationIdCapacities as any,
  }),
  createToolFromOperation({
    id: "VTEX_GET_FULFILLMENT_LOCATION",
    description: "Get details of a fulfillment location.",
    annotations: { readOnlyHint: true },
    requestSchema:
      operationalCapacityZod.zGetApiFulfillmentLocationsLocationData,
    sdkFn: operationalCapacitySdk.getApiFulfillmentLocationsLocation as any,
  }),
  createToolFromOperation({
    id: "VTEX_PUT_FULFILLMENT_LOCATION_STATUS",
    description: "Update the status of a fulfillment location.",
    requestSchema:
      operationalCapacityZod.zPutApiFulfillmentLocationsLocationsByLocationIdStatusData,
    sdkFn:
      operationalCapacitySdk.putApiFulfillmentLocationsLocationsByLocationIdStatus as any,
  }),
];

// ── Orders API PII Version ─────────────────────────────────────────────────────
import * as ordersPiiZod from "../generated/orders-api-pii-version/zod.gen.ts";
import * as ordersPiiSdk from "../generated/orders-api-pii-version/sdk.gen.ts";

export const ordersPiiTools = [
  createToolFromOperation({
    id: "VTEX_PII_GET_ORDER",
    description: "Get full details of an order (PII-compliant version).",
    annotations: { readOnlyHint: true },
    requestSchema: ordersPiiZod.zGetOrder2Data,
    sdkFn: ordersPiiSdk.getOrder2 as any,
  }),
  createToolFromOperation({
    id: "VTEX_PII_LIST_ORDERS",
    description: "List orders with optional filters (PII-compliant version).",
    annotations: { readOnlyHint: true },
    requestSchema: ordersPiiZod.zListOrders2Data,
    sdkFn: ordersPiiSdk.listOrders2 as any,
  }),
  createToolFromOperation({
    id: "VTEX_PII_START_HANDLING",
    description:
      "Notify VTEX that handling has started for an order (PII version).",
    requestSchema: ordersPiiZod.zStartHandling2Data,
    sdkFn: ordersPiiSdk.startHandling2 as any,
  }),
  createToolFromOperation({
    id: "VTEX_PII_CANCEL_ORDER",
    description: "Cancel an order (PII-compliant version).",
    annotations: { destructiveHint: true },
    requestSchema: ordersPiiZod.zCancelOrder2Data,
    sdkFn: ordersPiiSdk.cancelOrder2 as any,
  }),
  createToolFromOperation({
    id: "VTEX_PII_INVOICE_NOTIFICATION",
    description: "Send invoice notification for an order (PII version).",
    requestSchema: ordersPiiZod.zInvoiceNotification2Data,
    sdkFn: ordersPiiSdk.invoiceNotification2 as any,
  }),
  createToolFromOperation({
    id: "VTEX_PII_SEND_PAYMENT_NOTIFICATION",
    description: "Send payment notification for an order (PII version).",
    requestSchema: ordersPiiZod.zSendPaymentNotification2Data,
    sdkFn: ordersPiiSdk.sendPaymentNotification2 as any,
  }),
];

// ── Organization Units ─────────────────────────────────────────────────────────
import * as organizationUnitsZod from "../generated/organization-units/zod.gen.ts";
import * as organizationUnitsSdk from "../generated/organization-units/sdk.gen.ts";

export const organizationUnitsTools = [
  createToolFromOperation({
    id: "VTEX_ORG_UNITS_GET_USER_SCOPES",
    description: "Get scopes for a specific user in organization units.",
    annotations: { readOnlyHint: true },
    requestSchema:
      organizationUnitsZod.zGetApiOrganizationUnitsV1UsersByUserIdScopesData,
    sdkFn:
      organizationUnitsSdk.getApiOrganizationUnitsV1UsersByUserIdScopes as any,
  }),
  createToolFromOperation({
    id: "VTEX_ORG_UNITS_GET_BY_USER_ID",
    description: "Get the organization unit for a specific user.",
    annotations: { readOnlyHint: true },
    requestSchema:
      organizationUnitsZod.zGetApiOrganizationUnitsV1ByUserIdUnitData,
    sdkFn: organizationUnitsSdk.getApiOrganizationUnitsV1ByUserIdUnit as any,
  }),
  createToolFromOperation({
    id: "VTEX_ORG_UNITS_LIST",
    description: "List all organization units.",
    annotations: { readOnlyHint: true },
    requestSchema: organizationUnitsZod.zGetApiOrganizationUnitsV1Data,
    sdkFn: organizationUnitsSdk.getApiOrganizationUnitsV1 as any,
  }),
  createToolFromOperation({
    id: "VTEX_ORG_UNITS_CREATE",
    description: "Create a new organization unit.",
    requestSchema: organizationUnitsZod.zPostApiOrganizationUnitsV1Data,
    sdkFn: organizationUnitsSdk.postApiOrganizationUnitsV1 as any,
  }),
  createToolFromOperation({
    id: "VTEX_ORG_UNITS_DELETE",
    description: "Delete an organization unit.",
    annotations: { destructiveHint: true },
    requestSchema:
      organizationUnitsZod.zDeleteApiOrganizationUnitsV1ByOrganizationUnitIdData,
    sdkFn:
      organizationUnitsSdk.deleteApiOrganizationUnitsV1ByOrganizationUnitId as any,
  }),
  createToolFromOperation({
    id: "VTEX_ORG_UNITS_GET",
    description: "Get details of an organization unit.",
    annotations: { readOnlyHint: true },
    requestSchema:
      organizationUnitsZod.zGetApiOrganizationUnitsV1ByOrganizationUnitIdData,
    sdkFn:
      organizationUnitsSdk.getApiOrganizationUnitsV1ByOrganizationUnitId as any,
  }),
  createToolFromOperation({
    id: "VTEX_ORG_UNITS_PATCH",
    description: "Update an organization unit.",
    requestSchema:
      organizationUnitsZod.zPatchApiOrganizationUnitsV1ByOrganizationUnitIdData,
    sdkFn:
      organizationUnitsSdk.patchApiOrganizationUnitsV1ByOrganizationUnitId as any,
  }),
  createToolFromOperation({
    id: "VTEX_ORG_UNITS_GET_CHILDREN",
    description: "Get children of an organization unit.",
    annotations: { readOnlyHint: true },
    requestSchema:
      organizationUnitsZod.zGetApiOrganizationUnitsV1ByOrganizationUnitIdChildrenData,
    sdkFn:
      organizationUnitsSdk.getApiOrganizationUnitsV1ByOrganizationUnitIdChildren as any,
  }),
  createToolFromOperation({
    id: "VTEX_ORG_UNITS_GET_ROOTS",
    description: "Get root organization units.",
    annotations: { readOnlyHint: true },
    requestSchema: organizationUnitsZod.zGetApiOrganizationUnitsV1RootsData,
    sdkFn: organizationUnitsSdk.getApiOrganizationUnitsV1Roots as any,
  }),
  createToolFromOperation({
    id: "VTEX_ORG_UNITS_POST_PATH",
    description: "Move an organization unit to a new path.",
    requestSchema:
      organizationUnitsZod.zPostApiOrganizationUnitsV1ByOrganizationUnitIdPathData,
    sdkFn:
      organizationUnitsSdk.postApiOrganizationUnitsV1ByOrganizationUnitIdPath as any,
  }),
  createToolFromOperation({
    id: "VTEX_ORG_UNITS_DELETE_USERS",
    description: "Remove users from an organization unit.",
    annotations: { destructiveHint: true },
    requestSchema:
      organizationUnitsZod.zDeleteApiOrganizationUnitsV1ByOrganizationUnitIdUsersData,
    sdkFn:
      organizationUnitsSdk.deleteApiOrganizationUnitsV1ByOrganizationUnitIdUsers as any,
  }),
  createToolFromOperation({
    id: "VTEX_ORG_UNITS_GET_USERS",
    description: "Get users in an organization unit.",
    annotations: { readOnlyHint: true },
    requestSchema:
      organizationUnitsZod.zGetApiOrganizationUnitsV1ByOrganizationUnitIdUsersData,
    sdkFn:
      organizationUnitsSdk.getApiOrganizationUnitsV1ByOrganizationUnitIdUsers as any,
  }),
  createToolFromOperation({
    id: "VTEX_ORG_UNITS_POST_USERS",
    description: "Add users to an organization unit.",
    requestSchema:
      organizationUnitsZod.zPostApiOrganizationUnitsV1ByOrganizationUnitIdUsersData,
    sdkFn:
      organizationUnitsSdk.postApiOrganizationUnitsV1ByOrganizationUnitIdUsers as any,
  }),
  createToolFromOperation({
    id: "VTEX_ORG_UNITS_DELETE_SCOPES",
    description: "Remove all scopes from an organization unit.",
    annotations: { destructiveHint: true },
    requestSchema:
      organizationUnitsZod.zDeleteApiOrganizationUnitsV1ByOrganizationUnitIdScopesData,
    sdkFn:
      organizationUnitsSdk.deleteApiOrganizationUnitsV1ByOrganizationUnitIdScopes as any,
  }),
  createToolFromOperation({
    id: "VTEX_ORG_UNITS_GET_SCOPES",
    description: "Get scopes of an organization unit.",
    annotations: { readOnlyHint: true },
    requestSchema:
      organizationUnitsZod.zGetApiOrganizationUnitsV1ByOrganizationUnitIdScopesData,
    sdkFn:
      organizationUnitsSdk.getApiOrganizationUnitsV1ByOrganizationUnitIdScopes as any,
  }),
  createToolFromOperation({
    id: "VTEX_ORG_UNITS_DELETE_SCOPE",
    description: "Remove a specific scope from an organization unit.",
    annotations: { destructiveHint: true },
    requestSchema:
      organizationUnitsZod.zDeleteApiOrganizationUnitsV1ByOrganizationUnitIdScopesByScopeData,
    sdkFn:
      organizationUnitsSdk.deleteApiOrganizationUnitsV1ByOrganizationUnitIdScopesByScope as any,
  }),
  createToolFromOperation({
    id: "VTEX_ORG_UNITS_POST_SCOPE",
    description: "Add a scope to an organization unit.",
    requestSchema:
      organizationUnitsZod.zPostApiOrganizationUnitsV1ByOrganizationUnitIdScopesByScopeData,
    sdkFn:
      organizationUnitsSdk.postApiOrganizationUnitsV1ByOrganizationUnitIdScopesByScope as any,
  }),
  createToolFromOperation({
    id: "VTEX_ORG_UNITS_PUT_SCOPE",
    description: "Update a scope in an organization unit.",
    requestSchema:
      organizationUnitsZod.zPutApiOrganizationUnitsV1ByOrganizationUnitIdScopesByScopeData,
    sdkFn:
      organizationUnitsSdk.putApiOrganizationUnitsV1ByOrganizationUnitIdScopesByScope as any,
  }),
  createToolFromOperation({
    id: "VTEX_ORG_UNITS_DELETE_SCOPE_REMOVE",
    description:
      "Remove a scope from an organization unit (alternate endpoint).",
    annotations: { destructiveHint: true },
    requestSchema:
      organizationUnitsZod.zDeleteApiOrganizationUnitsV1ByOrganizationUnitIdScopesByScopeRemoveData,
    sdkFn:
      organizationUnitsSdk.deleteApiOrganizationUnitsV1ByOrganizationUnitIdScopesByScopeRemove as any,
  }),
  createToolFromOperation({
    id: "VTEX_ORG_UNITS_GET_BY_SCOPE_VALUE",
    description: "Get organization units by scope value.",
    annotations: { readOnlyHint: true },
    requestSchema:
      organizationUnitsZod.zGetApiOrganizationUnitsV1ScopeByScopeValueByScopeValueData,
    sdkFn:
      organizationUnitsSdk.getApiOrganizationUnitsV1ScopeByScopeValueByScopeValue as any,
  }),
];

// ── Payment Provider Protocol ──────────────────────────────────────────────────
import * as paymentProviderZod from "../generated/payment-provider-protocol/zod.gen.ts";
import * as paymentProviderSdk from "../generated/payment-provider-protocol/sdk.gen.ts";

export const paymentProviderProtocolTools = [
  createToolFromOperation({
    id: "VTEX_PAYMENT_PROVIDER_MANIFEST",
    description: "Get the payment provider manifest.",
    annotations: { readOnlyHint: true },
    requestSchema: paymentProviderZod.zManifestData,
    sdkFn: paymentProviderSdk.manifest as any,
  }),
  createToolFromOperation({
    id: "VTEX_PAYMENT_PROVIDER_CREATE_PAYMENT",
    description: "Create a payment in the payment provider.",
    requestSchema: paymentProviderZod.zCreatePaymentData,
    sdkFn: paymentProviderSdk.createPayment as any,
  }),
  createToolFromOperation({
    id: "VTEX_PAYMENT_PROVIDER_CANCEL_PAYMENT",
    description: "Cancel a payment in the payment provider.",
    annotations: { destructiveHint: true },
    requestSchema: paymentProviderZod.zCancelPaymentData,
    sdkFn: paymentProviderSdk.cancelPayment as any,
  }),
  createToolFromOperation({
    id: "VTEX_PAYMENT_PROVIDER_SETTLE_PAYMENT",
    description: "Settle a payment in the payment provider.",
    requestSchema: paymentProviderZod.zSettlePaymentData,
    sdkFn: paymentProviderSdk.settlePayment as any,
  }),
  createToolFromOperation({
    id: "VTEX_PAYMENT_PROVIDER_REFUND_PAYMENT",
    description: "Refund a payment in the payment provider.",
    requestSchema: paymentProviderZod.zRefundPaymentData,
    sdkFn: paymentProviderSdk.refundPayment as any,
  }),
  createToolFromOperation({
    id: "VTEX_PAYMENT_PROVIDER_INBOUND_REQUEST",
    description: "Send an inbound request to the payment provider (beta).",
    requestSchema: paymentProviderZod.zInboundRequestBetaData,
    sdkFn: paymentProviderSdk.inboundRequestBeta as any,
  }),
  createToolFromOperation({
    id: "VTEX_PAYMENT_PROVIDER_CREATE_AUTHORIZATION_TOKEN",
    description: "Create an authorization token for the payment provider.",
    requestSchema: paymentProviderZod.zCreateAuthorizationTokenData,
    sdkFn: paymentProviderSdk.createAuthorizationToken as any,
  }),
  createToolFromOperation({
    id: "VTEX_PAYMENT_PROVIDER_AUTHENTICATION",
    description: "Authenticate with the payment provider.",
    requestSchema: paymentProviderZod.zProviderAuthenticationData,
    sdkFn: paymentProviderSdk.providerAuthentication as any,
  }),
  createToolFromOperation({
    id: "VTEX_PAYMENT_PROVIDER_GET_CREDENTIALS",
    description: "Get credentials from the payment provider.",
    annotations: { readOnlyHint: true },
    requestSchema: paymentProviderZod.zGetCredentialsData,
    sdkFn: paymentProviderSdk.getCredentials as any,
  }),
];

// ── Payments Gateway ───────────────────────────────────────────────────────────
import * as paymentsGatewayZod from "../generated/payments-gateway/zod.gen.ts";
import * as paymentsGatewaySdk from "../generated/payments-gateway/sdk.gen.ts";

export const paymentsGatewayTools = [
  createToolFromOperation({
    id: "VTEX_PAYMENTS_GATEWAY_INSTALLMENT_OPTIONS",
    description: "Get installment options for a payment.",
    annotations: { readOnlyHint: true },
    requestSchema: paymentsGatewayZod.zInstallmentsoptionsData,
    sdkFn: paymentsGatewaySdk.installmentsoptions as any,
  }),
  createToolFromOperation({
    id: "VTEX_PAYMENTS_GATEWAY_AFFILIATIONS",
    description: "Get list of payment affiliations.",
    annotations: { readOnlyHint: true },
    requestSchema: paymentsGatewayZod.zAffiliationsData,
    sdkFn: paymentsGatewaySdk.affiliations as any,
  }),
  createToolFromOperation({
    id: "VTEX_PAYMENTS_GATEWAY_INSERT_AFFILIATION",
    description: "Create a new payment affiliation.",
    requestSchema: paymentsGatewayZod.zInsertAffiliationData,
    sdkFn: paymentsGatewaySdk.insertAffiliation as any,
  }),
  createToolFromOperation({
    id: "VTEX_PAYMENTS_GATEWAY_AFFILIATION_BY_ID",
    description: "Get a payment affiliation by ID.",
    annotations: { readOnlyHint: true },
    requestSchema: paymentsGatewayZod.zAffiliationByIdData,
    sdkFn: paymentsGatewaySdk.affiliationById as any,
  }),
  createToolFromOperation({
    id: "VTEX_PAYMENTS_GATEWAY_UPDATE_AFFILIATION",
    description: "Update a payment affiliation.",
    requestSchema: paymentsGatewayZod.zUpdateAffiliationData,
    sdkFn: paymentsGatewaySdk.updateAffiliation as any,
  }),
  createToolFromOperation({
    id: "VTEX_PAYMENTS_GATEWAY_RULES",
    description: "Get list of payment rules.",
    annotations: { readOnlyHint: true },
    requestSchema: paymentsGatewayZod.zRulesData,
    sdkFn: paymentsGatewaySdk.rules as any,
  }),
  createToolFromOperation({
    id: "VTEX_PAYMENTS_GATEWAY_INSERT_RULE",
    description: "Create a new payment rule.",
    requestSchema: paymentsGatewayZod.zInsertRuleData,
    sdkFn: paymentsGatewaySdk.insertRule as any,
  }),
  createToolFromOperation({
    id: "VTEX_PAYMENTS_GATEWAY_RULE",
    description: "Get a payment rule.",
    annotations: { readOnlyHint: true },
    requestSchema: paymentsGatewayZod.zRuleData,
    sdkFn: paymentsGatewaySdk.rule as any,
  }),
  createToolFromOperation({
    id: "VTEX_PAYMENTS_GATEWAY_RULE_BY_ID",
    description: "Get a payment rule by ID.",
    annotations: { readOnlyHint: true },
    requestSchema: paymentsGatewayZod.zRuleByIdData,
    sdkFn: paymentsGatewaySdk.ruleById as any,
  }),
  createToolFromOperation({
    id: "VTEX_PAYMENTS_GATEWAY_PUT_RULE_BY_ID",
    description: "Update a payment rule by ID.",
    requestSchema: paymentsGatewayZod.zPutRuleByIdData,
    sdkFn: paymentsGatewaySdk.putRuleById as any,
  }),
  createToolFromOperation({
    id: "VTEX_PAYMENTS_GATEWAY_AVAILABLE_PAYMENT_METHODS",
    description: "Get available payment methods.",
    annotations: { readOnlyHint: true },
    requestSchema: paymentsGatewayZod.zAvailablePaymentMethodsData,
    sdkFn: paymentsGatewaySdk.availablePaymentMethods as any,
  }),
  createToolFromOperation({
    id: "VTEX_PAYMENTS_GATEWAY_GET_CARD_TOKEN_BY_ID",
    description: "Get a card token by ID via payments gateway.",
    annotations: { readOnlyHint: true },
    requestSchema: paymentsGatewayZod.zGetCardTokenByIdData,
    sdkFn: paymentsGatewaySdk.getCardTokenById as any,
  }),
  createToolFromOperation({
    id: "VTEX_PAYMENTS_GATEWAY_CREATE_TRANSACTION",
    description: "Create a new payment transaction.",
    requestSchema: paymentsGatewayZod.zCreateanewtransactionData,
    sdkFn: paymentsGatewaySdk._1Createanewtransaction as any,
  }),
  createToolFromOperation({
    id: "VTEX_PAYMENTS_GATEWAY_SEND_PAYMENTS_PUBLIC",
    description: "Send payment data (public).",
    requestSchema: paymentsGatewayZod.zSendPaymentsPublicData,
    sdkFn: paymentsGatewaySdk._2SendPaymentsPublic as any,
  }),
  createToolFromOperation({
    id: "VTEX_PAYMENTS_GATEWAY_UPDATE_ADDITIONAL_DATA",
    description: "Update additional data for a transaction.",
    requestSchema: paymentsGatewayZod.zUpdateAdditionalDataData,
    sdkFn: paymentsGatewaySdk._31UpdateAdditionalData as any,
  }),
  createToolFromOperation({
    id: "VTEX_PAYMENTS_GATEWAY_SEND_ADDITIONAL_DATA",
    description: "Send additional data to the payments gateway.",
    requestSchema: paymentsGatewayZod.zSendAdditionalDataData,
    sdkFn: paymentsGatewaySdk._3SendAdditionalData as any,
  }),
  createToolFromOperation({
    id: "VTEX_PAYMENTS_GATEWAY_DO_AUTHORIZATION",
    description: "Authorize a payment transaction.",
    requestSchema: paymentsGatewayZod.zDoauthorizationData,
    sdkFn: paymentsGatewaySdk._4Doauthorization as any,
  }),
  createToolFromOperation({
    id: "VTEX_PAYMENTS_GATEWAY_TRANSACTION_DETAILS",
    description: "Get details of a payment transaction.",
    annotations: { readOnlyHint: true },
    requestSchema: paymentsGatewayZod.zTransactionDetailsData,
    sdkFn: paymentsGatewaySdk.transactionDetails as any,
  }),
  createToolFromOperation({
    id: "VTEX_PAYMENTS_GATEWAY_PAYMENT_DETAILS",
    description: "Get payment details.",
    annotations: { readOnlyHint: true },
    requestSchema: paymentsGatewayZod.zPaymentDetailsData,
    sdkFn: paymentsGatewaySdk.paymentDetails as any,
  }),
  createToolFromOperation({
    id: "VTEX_PAYMENTS_GATEWAY_TRANSACTION_SETTLEMENT_DETAILS",
    description: "Get settlement details for a transaction.",
    annotations: { readOnlyHint: true },
    requestSchema: paymentsGatewayZod.zTransactionSettlementDetailsData,
    sdkFn: paymentsGatewaySdk.transactionSettlementDetails as any,
  }),
  createToolFromOperation({
    id: "VTEX_PAYMENTS_GATEWAY_SETTLE_TRANSACTION",
    description: "Settle a payment transaction.",
    requestSchema: paymentsGatewayZod.zSettlethetransactionData,
    sdkFn: paymentsGatewaySdk.settlethetransaction as any,
  }),
  createToolFromOperation({
    id: "VTEX_PAYMENTS_GATEWAY_REFUND_TRANSACTION",
    description: "Refund a payment transaction.",
    requestSchema: paymentsGatewayZod.zRefundthetransactionData,
    sdkFn: paymentsGatewaySdk.refundthetransaction as any,
  }),
  createToolFromOperation({
    id: "VTEX_PAYMENTS_GATEWAY_CANCEL_TRANSACTION",
    description: "Cancel a payment transaction.",
    annotations: { destructiveHint: true },
    requestSchema: paymentsGatewayZod.zCancelthetransactionData,
    sdkFn: paymentsGatewaySdk.cancelthetransaction as any,
  }),
  createToolFromOperation({
    id: "VTEX_PAYMENTS_GATEWAY_GET_PAYMENT_NOTIFICATION",
    description: "Get payment notification for a payment.",
    annotations: { readOnlyHint: true },
    requestSchema:
      paymentsGatewayZod.zGetApiPaymentsPvtPaymentsByPaymentIdPaymentNotificationData,
    sdkFn:
      paymentsGatewaySdk.getApiPaymentsPvtPaymentsByPaymentIdPaymentNotification as any,
  }),
  createToolFromOperation({
    id: "VTEX_PAYMENTS_GATEWAY_POST_PAYMENT_NOTIFICATION",
    description: "Send a payment notification.",
    requestSchema:
      paymentsGatewayZod.zPostApiPaymentsPvtPaymentsByPaymentIdPaymentNotificationData,
    sdkFn:
      paymentsGatewaySdk.postApiPaymentsPvtPaymentsByPaymentIdPaymentNotification as any,
  }),
];

// ── Pick and Pack ──────────────────────────────────────────────────────────────
import * as pickAndPackZod from "../generated/pick-and-pack/zod.gen.ts";
import * as pickAndPackSdk from "../generated/pick-and-pack/sdk.gen.ts";

export const pickAndPackTools = [
  createToolFromOperation({
    id: "VTEX_PICK_AND_PACK_POST_TOKEN",
    description: "Authenticate to Pick and Pack and get a token.",
    requestSchema: pickAndPackZod.zPostTokenData,
    sdkFn: pickAndPackSdk.postToken as any,
  }),
  createToolFromOperation({
    id: "VTEX_PICK_AND_PACK_GET_ORDER",
    description: "Get a Pick and Pack order by order ID.",
    annotations: { readOnlyHint: true },
    requestSchema: pickAndPackZod.zGetOrdersByOrderIdData,
    sdkFn: pickAndPackSdk.getOrdersByOrderId as any,
  }),
  createToolFromOperation({
    id: "VTEX_PICK_AND_PACK_PATCH_ORDER_TRACKING",
    description: "Update tracking information for a Pick and Pack order.",
    requestSchema: pickAndPackZod.zPatchOrdersByOrderIdTrackingData,
    sdkFn: pickAndPackSdk.patchOrdersByOrderIdTracking as any,
  }),
  createToolFromOperation({
    id: "VTEX_PICK_AND_PACK_GET_WORKSHEET",
    description: "Get a Pick and Pack worksheet by ID.",
    annotations: { readOnlyHint: true },
    requestSchema: pickAndPackZod.zGetWorksheetsByWorksheetIdData,
    sdkFn: pickAndPackSdk.getWorksheetsByWorksheetId as any,
  }),
  createToolFromOperation({
    id: "VTEX_PICK_AND_PACK_GET_WORKSHEETS",
    description: "Get all Pick and Pack worksheets.",
    annotations: { readOnlyHint: true },
    requestSchema: pickAndPackZod.zGetWorksheetsData,
    sdkFn: pickAndPackSdk.getWorksheets as any,
  }),
  createToolFromOperation({
    id: "VTEX_PICK_AND_PACK_GET_FACILITY",
    description: "Get a Pick and Pack facility by ID.",
    annotations: { readOnlyHint: true },
    requestSchema: pickAndPackZod.zGetFacilitiesByFacilityIdData,
    sdkFn: pickAndPackSdk.getFacilitiesByFacilityId as any,
  }),
  createToolFromOperation({
    id: "VTEX_PICK_AND_PACK_GET_SHIPMENT",
    description: "Get a Pick and Pack shipment by ID.",
    annotations: { readOnlyHint: true },
    requestSchema: pickAndPackZod.zGetShipmentsByShipmentIdData,
    sdkFn: pickAndPackSdk.getShipmentsByShipmentId as any,
  }),
  createToolFromOperation({
    id: "VTEX_PICK_AND_PACK_GET_SHIPMENTS",
    description: "Get all Pick and Pack shipments.",
    annotations: { readOnlyHint: true },
    requestSchema: pickAndPackZod.zGetShipmentsData,
    sdkFn: pickAndPackSdk.getShipments as any,
  }),
];

// ── Pick and Pack Last Mile Protocol ──────────────────────────────────────────
import * as pickAndPackLastMileZod from "../generated/pick-and-pack-last-mile-protocol/zod.gen.ts";
import * as pickAndPackLastMileSdk from "../generated/pick-and-pack-last-mile-protocol/sdk.gen.ts";

export const pickAndPackLastMileTools = [
  createToolFromOperation({
    id: "VTEX_LAST_MILE_CREATE_TOKEN",
    description: "Create authentication token for last mile protocol.",
    requestSchema: pickAndPackLastMileZod.zCreatetokenData,
    sdkFn: pickAndPackLastMileSdk.createtoken as any,
  }),
  createToolFromOperation({
    id: "VTEX_LAST_MILE_CREATE_SERVICE",
    description: "Create a last mile service.",
    requestSchema: pickAndPackLastMileZod.zCreateserviceData,
    sdkFn: pickAndPackLastMileSdk.createservice as any,
  }),
  createToolFromOperation({
    id: "VTEX_LAST_MILE_CREATE_SERVICE2",
    description: "Create a last mile service (alternate endpoint).",
    requestSchema: pickAndPackLastMileZod.zCreateservice2Data,
    sdkFn: pickAndPackLastMileSdk.createservice2 as any,
  }),
  createToolFromOperation({
    id: "VTEX_LAST_MILE_CREATE_SERVICE3",
    description: "Create a last mile service (third endpoint).",
    requestSchema: pickAndPackLastMileZod.zCreateservice3Data,
    sdkFn: pickAndPackLastMileSdk.createservice3 as any,
  }),
  createToolFromOperation({
    id: "VTEX_LAST_MILE_GET_SERVICE",
    description: "Get a last mile service.",
    annotations: { readOnlyHint: true },
    requestSchema: pickAndPackLastMileZod.zGetserviceData,
    sdkFn: pickAndPackLastMileSdk.getservice as any,
  }),
  createToolFromOperation({
    id: "VTEX_LAST_MILE_UPDATE_SERVICE",
    description: "Update a last mile service.",
    requestSchema: pickAndPackLastMileZod.zUpdateserviceData,
    sdkFn: pickAndPackLastMileSdk.updateservice as any,
  }),
  createToolFromOperation({
    id: "VTEX_LAST_MILE_CREATE_NOTES",
    description: "Create notes for a last mile service.",
    requestSchema: pickAndPackLastMileZod.zCreatenotesData,
    sdkFn: pickAndPackLastMileSdk.createnotes as any,
  }),
  createToolFromOperation({
    id: "VTEX_LAST_MILE_CREATE_EVIDENCE",
    description: "Create evidence for a last mile service.",
    requestSchema: pickAndPackLastMileZod.zCreateevidenceData,
    sdkFn: pickAndPackLastMileSdk.createevidence as any,
  }),
  createToolFromOperation({
    id: "VTEX_LAST_MILE_CREATE_LABELS",
    description: "Create labels for a last mile service.",
    requestSchema: pickAndPackLastMileZod.zCreatelabelsData,
    sdkFn: pickAndPackLastMileSdk.createlabels as any,
  }),
  createToolFromOperation({
    id: "VTEX_LAST_MILE_CANCEL_SERVICE",
    description: "Cancel a last mile service.",
    annotations: { destructiveHint: true },
    requestSchema: pickAndPackLastMileZod.zPostCancelserviceData,
    sdkFn: pickAndPackLastMileSdk.postCancelservice as any,
  }),
  createToolFromOperation({
    id: "VTEX_LAST_MILE_CREATE_SERVICE4",
    description: "Create a last mile service (fourth endpoint).",
    requestSchema: pickAndPackLastMileZod.zCreateservice4Data,
    sdkFn: pickAndPackLastMileSdk.createservice4 as any,
  }),
  createToolFromOperation({
    id: "VTEX_LAST_MILE_CREATE_SERVICE5",
    description: "Create a last mile service (fifth endpoint).",
    requestSchema: pickAndPackLastMileZod.zCreateservice5Data,
    sdkFn: pickAndPackLastMileSdk.createservice5 as any,
  }),
  createToolFromOperation({
    id: "VTEX_LAST_MILE_ONHOLD_SERVICE",
    description: "Put a last mile service on hold.",
    requestSchema: pickAndPackLastMileZod.zOnholdserviceData,
    sdkFn: pickAndPackLastMileSdk.onholdservice as any,
  }),
];

// ── Pick and Pack Order Changes ────────────────────────────────────────────────
import * as pickAndPackOrderChangesZod from "../generated/pick-and-pack-order-changes/zod.gen.ts";
import * as pickAndPackOrderChangesSdk from "../generated/pick-and-pack-order-changes/sdk.gen.ts";

export const pickAndPackOrderChangesTools = [
  createToolFromOperation({
    id: "VTEX_ORDER_CHANGES_PUT_DEADLINE",
    description: "Update the deadline for an order.",
    requestSchema: pickAndPackOrderChangesZod.zPutOrdersByOrderIdDeadlineData,
    sdkFn: pickAndPackOrderChangesSdk.putOrdersByOrderIdDeadline as any,
  }),
  createToolFromOperation({
    id: "VTEX_ORDER_CHANGES_POST_CHANGE",
    description: "Post an order change.",
    requestSchema: pickAndPackOrderChangesZod.zPostOrderChangesData,
    sdkFn: pickAndPackOrderChangesSdk.postOrderChanges as any,
  }),
  createToolFromOperation({
    id: "VTEX_ORDER_CHANGES_DELETE_SKU_WAREHOUSE",
    description: "Remove a SKU-warehouse association for order changes.",
    annotations: { destructiveHint: true },
    requestSchema:
      pickAndPackOrderChangesZod.zDeleteBySkuIdWarehousesByWarehouseIdData,
    sdkFn:
      pickAndPackOrderChangesSdk.deleteBySkuIdWarehousesByWarehouseId as any,
  }),
  createToolFromOperation({
    id: "VTEX_ORDER_CHANGES_GET_SKU_WAREHOUSE",
    description: "Get a SKU-warehouse association for order changes.",
    annotations: { readOnlyHint: true },
    requestSchema:
      pickAndPackOrderChangesZod.zGetBySkuIdWarehousesByWarehouseIdData,
    sdkFn: pickAndPackOrderChangesSdk.getBySkuIdWarehousesByWarehouseId as any,
  }),
  createToolFromOperation({
    id: "VTEX_ORDER_CHANGES_POST_SKU_WAREHOUSE",
    description: "Create a SKU-warehouse association for order changes.",
    requestSchema:
      pickAndPackOrderChangesZod.zPostBySkuIdWarehousesByWarehouseIdData,
    sdkFn: pickAndPackOrderChangesSdk.postBySkuIdWarehousesByWarehouseId as any,
  }),
  createToolFromOperation({
    id: "VTEX_ORDER_CHANGES_PUT_SKU_WAREHOUSE",
    description: "Update a SKU-warehouse association for order changes.",
    requestSchema:
      pickAndPackOrderChangesZod.zPutBySkuIdWarehousesByWarehouseIdData,
    sdkFn: pickAndPackOrderChangesSdk.putBySkuIdWarehousesByWarehouseId as any,
  }),
  createToolFromOperation({
    id: "VTEX_ORDER_CHANGES_DELETE_SKU_WAREHOUSES",
    description: "Remove all warehouse associations for a SKU.",
    annotations: { destructiveHint: true },
    requestSchema: pickAndPackOrderChangesZod.zDeleteBySkuIdWarehousesData,
    sdkFn: pickAndPackOrderChangesSdk.deleteBySkuIdWarehouses as any,
  }),
  createToolFromOperation({
    id: "VTEX_ORDER_CHANGES_GET_SKU_WAREHOUSES",
    description: "Get all warehouse associations for a SKU.",
    annotations: { readOnlyHint: true },
    requestSchema: pickAndPackOrderChangesZod.zGetBySkuIdWarehousesData,
    sdkFn: pickAndPackOrderChangesSdk.getBySkuIdWarehouses as any,
  }),
];

// ── Policies System ────────────────────────────────────────────────────────────
import * as policiesSystemZod from "../generated/policies-system/zod.gen.ts";
import * as policiesSystemSdk from "../generated/policies-system/sdk.gen.ts";

export const policiesSystemTools = [
  createToolFromOperation({
    id: "VTEX_POLICY_LIST",
    description: "List all policies in the policies system.",
    annotations: { readOnlyHint: true },
    requestSchema: policiesSystemZod.zPolicyListData,
    sdkFn: policiesSystemSdk.policyList as any,
  }),
  createToolFromOperation({
    id: "VTEX_POLICY_EVALUATE",
    description: "Evaluate a policy.",
    requestSchema: policiesSystemZod.zPolicyEvaluateData,
    sdkFn: policiesSystemSdk.policyEvaluate as any,
  }),
  createToolFromOperation({
    id: "VTEX_POLICY_DELETE",
    description: "Delete a policy.",
    annotations: { destructiveHint: true },
    requestSchema: policiesSystemZod.zPolicyDeleteData,
    sdkFn: policiesSystemSdk.policyDelete as any,
  }),
  createToolFromOperation({
    id: "VTEX_POLICY_GET",
    description: "Get a policy by ID.",
    annotations: { readOnlyHint: true },
    requestSchema: policiesSystemZod.zPolicyGetData,
    sdkFn: policiesSystemSdk.policyGet as any,
  }),
  createToolFromOperation({
    id: "VTEX_POLICY_CREATE_OR_UPDATE",
    description: "Create or update a policy.",
    requestSchema: policiesSystemZod.zPolicyCreateOrUpdateData,
    sdkFn: policiesSystemSdk.policyCreateOrUpdate as any,
  }),
  createToolFromOperation({
    id: "VTEX_POLICY_UPDATE",
    description: "Update an existing policy.",
    requestSchema: policiesSystemZod.zPolicyUpdateData,
    sdkFn: policiesSystemSdk.policyUpdate as any,
  }),
];

// ── Pricing Hub ────────────────────────────────────────────────────────────────
import * as pricingHubZod from "../generated/pricing-hub/zod.gen.ts";
import * as pricingHubSdk from "../generated/pricing-hub/sdk.gen.ts";

export const pricingHubTools = [
  createToolFromOperation({
    id: "VTEX_PRICING_HUB_POST_PRICES",
    description: "Get prices from external price source via Pricing Hub.",
    requestSchema: pricingHubZod.zPostApiPricingHubPricesData,
    sdkFn: pricingHubSdk.postApiPricingHubPrices as any,
  }),
  createToolFromOperation({
    id: "VTEX_PRICING_HUB_CONFIG_EXTERNAL_PRICE_SOURCE",
    description: "Configure an external price source in Pricing Hub.",
    requestSchema: pricingHubZod.zConfigExternalPriceSourceData,
    sdkFn: pricingHubSdk.configExternalPriceSource as any,
  }),
];

// ── Profile System ─────────────────────────────────────────────────────────────
import * as profileSystemZod from "../generated/profile-system/zod.gen.ts";
import * as profileSystemSdk from "../generated/profile-system/sdk.gen.ts";

export const profileSystemTools = [
  createToolFromOperation({
    id: "VTEX_PROFILE_CREATE_CLIENT_PROFILE",
    description: "Create a new client profile.",
    requestSchema: profileSystemZod.zCreateClientProfileData,
    sdkFn: profileSystemSdk.createClientProfile as any,
  }),
  createToolFromOperation({
    id: "VTEX_PROFILE_DELETE_CLIENT_PROFILE",
    description: "Delete a client profile.",
    annotations: { destructiveHint: true },
    requestSchema: profileSystemZod.zDeleteClientProfileData,
    sdkFn: profileSystemSdk.deleteClientProfile as any,
  }),
  createToolFromOperation({
    id: "VTEX_PROFILE_GET_PROFILE",
    description: "Get a client profile.",
    annotations: { readOnlyHint: true },
    requestSchema: profileSystemZod.zGetProfileData,
    sdkFn: profileSystemSdk.getProfile as any,
  }),
  createToolFromOperation({
    id: "VTEX_PROFILE_UPDATE_CLIENT_PROFILE",
    description: "Update a client profile.",
    requestSchema: profileSystemZod.zUpdateClientProfileData,
    sdkFn: profileSystemSdk.updateClientProfile as any,
  }),
  createToolFromOperation({
    id: "VTEX_PROFILE_GET_UNMASKED_PROFILE",
    description: "Get an unmasked client profile.",
    annotations: { readOnlyHint: true },
    requestSchema: profileSystemZod.zGetUnmaskedProfileData,
    sdkFn: profileSystemSdk.getUnmaskedProfile as any,
  }),
  createToolFromOperation({
    id: "VTEX_PROFILE_GET_PROFILE_BY_VERSION",
    description: "Get a client profile by version.",
    annotations: { readOnlyHint: true },
    requestSchema: profileSystemZod.zGetProfileByVersionData,
    sdkFn: profileSystemSdk.getProfileByVersion as any,
  }),
  createToolFromOperation({
    id: "VTEX_PROFILE_GET_UNMASKED_PROFILE_BY_VERSION",
    description: "Get an unmasked client profile by version.",
    annotations: { readOnlyHint: true },
    requestSchema: profileSystemZod.zGetUnmaskedProfileByVersionData,
    sdkFn: profileSystemSdk.getUnmaskedProfileByVersion as any,
  }),
  createToolFromOperation({
    id: "VTEX_PROFILE_GET_CLIENT_ADDRESSES",
    description: "Get all addresses for a client profile.",
    annotations: { readOnlyHint: true },
    requestSchema: profileSystemZod.zGetClientAddressesData,
    sdkFn: profileSystemSdk.getClientAddresses as any,
  }),
  createToolFromOperation({
    id: "VTEX_PROFILE_CREATE_CLIENT_ADDRESS",
    description: "Create a new address for a client profile.",
    requestSchema: profileSystemZod.zCreateClientAddressData,
    sdkFn: profileSystemSdk.createClientAddress as any,
  }),
  createToolFromOperation({
    id: "VTEX_PROFILE_GET_UNMASKED_CLIENT_ADDRESSES",
    description: "Get unmasked addresses for a client profile.",
    annotations: { readOnlyHint: true },
    requestSchema: profileSystemZod.zGetUnmaskedClientAddressesData,
    sdkFn: profileSystemSdk.getUnmaskedClientAddresses as any,
  }),
  createToolFromOperation({
    id: "VTEX_PROFILE_DELETE_ADDRESS",
    description: "Delete an address from a client profile.",
    annotations: { destructiveHint: true },
    requestSchema: profileSystemZod.zDeleteAddressData,
    sdkFn: profileSystemSdk.deleteAddress as any,
  }),
  createToolFromOperation({
    id: "VTEX_PROFILE_GET_ADDRESS",
    description: "Get a specific address from a client profile.",
    annotations: { readOnlyHint: true },
    requestSchema: profileSystemZod.zGetAddressData,
    sdkFn: profileSystemSdk.getAddress as any,
  }),
  createToolFromOperation({
    id: "VTEX_PROFILE_UPDATE_CLIENT_ADDRESS",
    description: "Update an address in a client profile.",
    requestSchema: profileSystemZod.zUpdateClientAddressData,
    sdkFn: profileSystemSdk.updateClientAddress as any,
  }),
  createToolFromOperation({
    id: "VTEX_PROFILE_GET_UNMASKED_ADDRESS",
    description: "Get an unmasked address from a client profile.",
    annotations: { readOnlyHint: true },
    requestSchema: profileSystemZod.zGetUnmaskedAddressData,
    sdkFn: profileSystemSdk.getUnmaskedAddress as any,
  }),
  createToolFromOperation({
    id: "VTEX_PROFILE_GET_ADDRESS_BY_VERSION",
    description: "Get an address by version from a client profile.",
    annotations: { readOnlyHint: true },
    requestSchema: profileSystemZod.zGetAddressByVersionData,
    sdkFn: profileSystemSdk.getAddressByVersion as any,
  }),
  createToolFromOperation({
    id: "VTEX_PROFILE_GET_UNMASKED_ADDRESS_BY_VERSION",
    description: "Get an unmasked address by version from a client profile.",
    annotations: { readOnlyHint: true },
    requestSchema: profileSystemZod.zGetUnmaskedAddressByVersionData,
    sdkFn: profileSystemSdk.getUnmaskedAddressByVersion as any,
  }),
  createToolFromOperation({
    id: "VTEX_PROFILE_GET_PROSPECTS",
    description: "Get prospects for a client profile.",
    annotations: { readOnlyHint: true },
    requestSchema: profileSystemZod.zGetProspectsData,
    sdkFn: profileSystemSdk.getProspects as any,
  }),
  createToolFromOperation({
    id: "VTEX_PROFILE_CREATE_PROSPECT",
    description: "Create a prospect for a client profile.",
    requestSchema: profileSystemZod.zCreateProspectData,
    sdkFn: profileSystemSdk.createProspect as any,
  }),
  createToolFromOperation({
    id: "VTEX_PROFILE_GET_UNMASKED_PROSPECTS",
    description: "Get unmasked prospects for a client profile.",
    annotations: { readOnlyHint: true },
    requestSchema: profileSystemZod.zGetUnmaskedProspectsData,
    sdkFn: profileSystemSdk.getUnmaskedProspects as any,
  }),
  createToolFromOperation({
    id: "VTEX_PROFILE_DELETE_PROSPECT",
    description: "Delete a prospect from a client profile.",
    annotations: { destructiveHint: true },
    requestSchema: profileSystemZod.zDeleteProspectData,
    sdkFn: profileSystemSdk.deleteProspect as any,
  }),
  createToolFromOperation({
    id: "VTEX_PROFILE_GET_PROSPECT",
    description: "Get a specific prospect from a client profile.",
    annotations: { readOnlyHint: true },
    requestSchema: profileSystemZod.zGetProspectData,
    sdkFn: profileSystemSdk.getProspect as any,
  }),
  createToolFromOperation({
    id: "VTEX_PROFILE_UPDATE_PROSPECT",
    description: "Update a prospect in a client profile.",
    requestSchema: profileSystemZod.zUpdateProspectData,
    sdkFn: profileSystemSdk.updateProspect as any,
  }),
  createToolFromOperation({
    id: "VTEX_PROFILE_GET_UNMASKED_PROSPECT",
    description: "Get an unmasked prospect from a client profile.",
    annotations: { readOnlyHint: true },
    requestSchema: profileSystemZod.zGetUnmaskedProspectData,
    sdkFn: profileSystemSdk.getUnmaskedProspect as any,
  }),
  createToolFromOperation({
    id: "VTEX_PROFILE_DELETE_PURCHASE_INFORMATION",
    description: "Delete purchase information from a client profile.",
    annotations: { destructiveHint: true },
    requestSchema: profileSystemZod.zDeletePurchaseInformationData,
    sdkFn: profileSystemSdk.deletePurchaseInformation as any,
  }),
  createToolFromOperation({
    id: "VTEX_PROFILE_GET_PURCHASE_INFORMATION",
    description: "Get purchase information for a client profile.",
    annotations: { readOnlyHint: true },
    requestSchema: profileSystemZod.zGetPurchaseInformationData,
    sdkFn: profileSystemSdk.getPurchaseInformation as any,
  }),
  createToolFromOperation({
    id: "VTEX_PROFILE_UPDATE_PURCHASE_INFORMATION",
    description: "Update purchase information for a client profile.",
    requestSchema: profileSystemZod.zUpdatePurchaseInformationData,
    sdkFn: profileSystemSdk.updatePurchaseInformation as any,
  }),
  createToolFromOperation({
    id: "VTEX_PROFILE_CREATE_PURCHASE_INFORMATION",
    description: "Create purchase information for a client profile.",
    requestSchema: profileSystemZod.zCreatePurchaseInformationData,
    sdkFn: profileSystemSdk.createPurchaseInformation as any,
  }),
  createToolFromOperation({
    id: "VTEX_PROFILE_GET_UNMASKED_PURCHASE_INFORMATION",
    description: "Get unmasked purchase information for a client profile.",
    annotations: { readOnlyHint: true },
    requestSchema: profileSystemZod.zGetUnmaskedPurchaseInformationData,
    sdkFn: profileSystemSdk.getUnmaskedPurchaseInformation as any,
  }),
  createToolFromOperation({
    id: "VTEX_PROFILE_GET_SCHEMA",
    description: "Get the profile system schema.",
    annotations: { readOnlyHint: true },
    requestSchema:
      profileSystemZod.zGetApiStorageProfileSystemSchemasProfileSystemData,
    sdkFn:
      profileSystemSdk.getApiStorageProfileSystemSchemasProfileSystem as any,
  }),
  createToolFromOperation({
    id: "VTEX_PROFILE_GET_CUSTOM_SCHEMA",
    description: "Get the custom profile system schema.",
    annotations: { readOnlyHint: true },
    requestSchema:
      profileSystemZod.zGetApiStorageProfileSystemSchemasProfileSystemCustomData,
    sdkFn:
      profileSystemSdk.getApiStorageProfileSystemSchemasProfileSystemCustom as any,
  }),
  createToolFromOperation({
    id: "VTEX_PROFILE_CREATE_OR_UPDATE_SCHEMA",
    description: "Create or update the profile system schema.",
    requestSchema: profileSystemZod.zCreateOrUpdateProfileSchemaData,
    sdkFn: profileSystemSdk.createOrUpdateProfileSchema as any,
  }),
];

// ── Promotions and Taxes ───────────────────────────────────────────────────────
import * as promotionsAndTaxesZod from "../generated/promotions-and-taxes/zod.gen.ts";
import * as promotionsAndTaxesSdk from "../generated/promotions-and-taxes/sdk.gen.ts";

export const promotionsAndTaxesTools = [
  createToolFromOperation({
    id: "VTEX_PROMOTIONS_CREATE_MULTIPLE_COUPONS",
    description: "Create multiple coupons in bulk.",
    requestSchema: promotionsAndTaxesZod.zCreateMultipleCouponsData,
    sdkFn: promotionsAndTaxesSdk.createMultipleCoupons as any,
  }),
  createToolFromOperation({
    id: "VTEX_PROMOTIONS_GET_ALL_COUPONS",
    description: "Get all coupons.",
    annotations: { readOnlyHint: true },
    requestSchema: promotionsAndTaxesZod.zGetallData,
    sdkFn: promotionsAndTaxesSdk.getall as any,
  }),
  createToolFromOperation({
    id: "VTEX_PROMOTIONS_CREATE_OR_UPDATE_COUPON",
    description: "Create or update a coupon.",
    requestSchema: promotionsAndTaxesZod.zCreateOrUpdateCouponData,
    sdkFn: promotionsAndTaxesSdk.createOrUpdateCoupon as any,
  }),
  createToolFromOperation({
    id: "VTEX_PROMOTIONS_GET_BY_COUPON_CODE",
    description: "Get a coupon by coupon code.",
    annotations: { readOnlyHint: true },
    requestSchema: promotionsAndTaxesZod.zGetbycouponcodeData,
    sdkFn: promotionsAndTaxesSdk.getbycouponcode as any,
  }),
  createToolFromOperation({
    id: "VTEX_PROMOTIONS_GET_ARCHIVED_COUPON",
    description: "Get an archived coupon by coupon code.",
    annotations: { readOnlyHint: true },
    requestSchema: promotionsAndTaxesZod.zGetarchivedbycouponcodeData,
    sdkFn: promotionsAndTaxesSdk.getarchivedbycouponcode as any,
  }),
  createToolFromOperation({
    id: "VTEX_PROMOTIONS_ARCHIVE_COUPON",
    description: "Archive a coupon by coupon code.",
    requestSchema: promotionsAndTaxesZod.zArchivebycouponcodeData,
    sdkFn: promotionsAndTaxesSdk.archivebycouponcode as any,
  }),
  createToolFromOperation({
    id: "VTEX_PROMOTIONS_MASSIVE_COUPON_GENERATION",
    description: "Generate coupons in bulk.",
    requestSchema: promotionsAndTaxesZod.zMassiveGenerationData,
    sdkFn: promotionsAndTaxesSdk.massiveGeneration as any,
  }),
  createToolFromOperation({
    id: "VTEX_PROMOTIONS_GET_COUPON_USAGE",
    description: "Get usage statistics for a coupon.",
    annotations: { readOnlyHint: true },
    requestSchema: promotionsAndTaxesZod.zGetusageData,
    sdkFn: promotionsAndTaxesSdk.getusage as any,
  }),
  createToolFromOperation({
    id: "VTEX_PROMOTIONS_UNARCHIVE_COUPON",
    description: "Unarchive a coupon by coupon code.",
    requestSchema: promotionsAndTaxesZod.zUnarchivebycouponcodeData,
    sdkFn: promotionsAndTaxesSdk.unarchivebycouponcode as any,
  }),
  createToolFromOperation({
    id: "VTEX_PROMOTIONS_GET_ALL_BENEFITS",
    description: "Get all promotions and benefits.",
    annotations: { readOnlyHint: true },
    requestSchema: promotionsAndTaxesZod.zGetAllBenefitsData,
    sdkFn: promotionsAndTaxesSdk.getAllBenefits as any,
  }),
  createToolFromOperation({
    id: "VTEX_PROMOTIONS_SEARCH_PROMOTION",
    description: "Search for a promotion by ID.",
    annotations: { readOnlyHint: true },
    requestSchema: promotionsAndTaxesZod.zSearchPromotionData,
    sdkFn: promotionsAndTaxesSdk.searchPromotion as any,
  }),
  createToolFromOperation({
    id: "VTEX_PROMOTIONS_GET_ALL_TAXES",
    description: "Get all taxes configured in the account.",
    annotations: { readOnlyHint: true },
    requestSchema: promotionsAndTaxesZod.zGetAllTaxesData,
    sdkFn: promotionsAndTaxesSdk.getAllTaxes as any,
  }),
  createToolFromOperation({
    id: "VTEX_PROMOTIONS_GET_CALCULATOR_CONFIGURATION",
    description: "Get a calculator configuration (promotion) by ID.",
    annotations: { readOnlyHint: true },
    requestSchema: promotionsAndTaxesZod.zGetCalculatorConfigurationByIdData,
    sdkFn: promotionsAndTaxesSdk.getCalculatorConfigurationById as any,
  }),
  createToolFromOperation({
    id: "VTEX_PROMOTIONS_OPT_SELLER_IN_OR_OUT",
    description: "Opt a seller in or out of a promotion.",
    requestSchema: promotionsAndTaxesZod.zOptSellerInOrOutOfPromotionData,
    sdkFn: promotionsAndTaxesSdk.optSellerInOrOutOfPromotion as any,
  }),
  createToolFromOperation({
    id: "VTEX_PROMOTIONS_CREATE_OR_UPDATE_CALCULATOR",
    description: "Create or update a promotion/tax configuration.",
    requestSchema:
      promotionsAndTaxesZod.zCreateOrUpdateCalculatorConfigurationData,
    sdkFn: promotionsAndTaxesSdk.createOrUpdateCalculatorConfiguration as any,
  }),
  createToolFromOperation({
    id: "VTEX_PROMOTIONS_CREATE_MULTIPLE_SKU_PROMOTION",
    description: "Create a promotion for multiple SKUs.",
    requestSchema: promotionsAndTaxesZod.zCreateMultipleSkuPromotionData,
    sdkFn: promotionsAndTaxesSdk.createMultipleSkuPromotion as any,
  }),
  createToolFromOperation({
    id: "VTEX_PROMOTIONS_UPDATE_MULTIPLE_SKU_PROMOTION",
    description: "Update a promotion for multiple SKUs.",
    requestSchema: promotionsAndTaxesZod.zUpdateMultipleSkuPromotionData,
    sdkFn: promotionsAndTaxesSdk.updateMultipleSkuPromotion as any,
  }),
  createToolFromOperation({
    id: "VTEX_PROMOTIONS_ARCHIVE_PROMOTION",
    description: "Archive a promotion.",
    requestSchema: promotionsAndTaxesZod.zArchivePromotionData,
    sdkFn: promotionsAndTaxesSdk.archivePromotion as any,
  }),
  createToolFromOperation({
    id: "VTEX_PROMOTIONS_UNARCHIVE_PROMOTION",
    description: "Unarchive a promotion.",
    requestSchema: promotionsAndTaxesZod.zUnarchivePromotionData,
    sdkFn: promotionsAndTaxesSdk.unarchivePromotion as any,
  }),
  createToolFromOperation({
    id: "VTEX_PROMOTIONS_GET_ARCHIVED_PROMOTIONS",
    description: "Get all archived promotions.",
    annotations: { readOnlyHint: true },
    requestSchema: promotionsAndTaxesZod.zGetArchivedPromotionsData,
    sdkFn: promotionsAndTaxesSdk.getArchivedPromotions as any,
  }),
  createToolFromOperation({
    id: "VTEX_PROMOTIONS_GET_ARCHIVED_TAXES",
    description: "Get all archived taxes.",
    annotations: { readOnlyHint: true },
    requestSchema: promotionsAndTaxesZod.zGetArchivedTaxesData,
    sdkFn: promotionsAndTaxesSdk.getArchivedTaxes as any,
  }),
  createToolFromOperation({
    id: "VTEX_PROMOTIONS_DELETE_BY_SKU_ID",
    description: "Delete a promotion price by SKU ID.",
    annotations: { destructiveHint: true },
    requestSchema: promotionsAndTaxesZod.zDeletebyskuIdData,
    sdkFn: promotionsAndTaxesSdk.deletebyskuId as any,
  }),
  createToolFromOperation({
    id: "VTEX_PROMOTIONS_PRICE_BY_SKU_ID",
    description: "Get promotion price by SKU ID.",
    annotations: { readOnlyHint: true },
    requestSchema: promotionsAndTaxesZod.zPricebyskuIdData,
    sdkFn: promotionsAndTaxesSdk.pricebyskuId as any,
  }),
  createToolFromOperation({
    id: "VTEX_PROMOTIONS_GET_ALL_PAGED",
    description: "Get all promotions with pagination.",
    annotations: { readOnlyHint: true },
    requestSchema: promotionsAndTaxesZod.zGetallpagedData,
    sdkFn: promotionsAndTaxesSdk.getallpaged as any,
  }),
  createToolFromOperation({
    id: "VTEX_PROMOTIONS_PRICE_BY_CONTEXT",
    description: "Get promotion price by context.",
    requestSchema: promotionsAndTaxesZod.zPricebycontextData,
    sdkFn: promotionsAndTaxesSdk.pricebycontext as any,
  }),
  createToolFromOperation({
    id: "VTEX_PROMOTIONS_PRICE_BY_SKU_AND_TRADE_POLICY",
    description: "Get promotion price by SKU ID and trade policy.",
    annotations: { readOnlyHint: true },
    requestSchema: promotionsAndTaxesZod.zPricebyskuIdandtradePolicyData,
    sdkFn: promotionsAndTaxesSdk.pricebyskuIdandtradePolicy as any,
  }),
  createToolFromOperation({
    id: "VTEX_PROMOTIONS_SAVE_PRICE",
    description: "Save a promotion price.",
    requestSchema: promotionsAndTaxesZod.zSavepriceData,
    sdkFn: promotionsAndTaxesSdk.saveprice as any,
  }),
  createToolFromOperation({
    id: "VTEX_PROMOTIONS_CALCULATE_DISCOUNTS_AND_TAXES_BUNDLES",
    description: "Calculate discounts and taxes for bundles.",
    requestSchema: promotionsAndTaxesZod.zCalculatediscountsandtaxesBundlesData,
    sdkFn: promotionsAndTaxesSdk.calculatediscountsandtaxesBundles as any,
  }),
  createToolFromOperation({
    id: "VTEX_PROMOTIONS_GET_CAMPAIGN_CONFIGURATION",
    description: "Get campaign configuration.",
    annotations: { readOnlyHint: true },
    requestSchema: promotionsAndTaxesZod.zGetcampaignconfigurationData,
    sdkFn: promotionsAndTaxesSdk.getcampaignconfiguration as any,
  }),
  createToolFromOperation({
    id: "VTEX_PROMOTIONS_GET_CAMPAIGN_AUDIENCES",
    description: "Get campaign audiences.",
    annotations: { readOnlyHint: true },
    requestSchema: promotionsAndTaxesZod.zGetcampaignaudiencesData,
    sdkFn: promotionsAndTaxesSdk.getcampaignaudiences as any,
  }),
  createToolFromOperation({
    id: "VTEX_PROMOTIONS_SET_CAMPAIGN_CONFIGURATION",
    description: "Set campaign configuration.",
    requestSchema: promotionsAndTaxesZod.zSetcampaignconfigurationData,
    sdkFn: promotionsAndTaxesSdk.setcampaignconfiguration as any,
  }),
];

// ── Promotions and Taxes API v2 ────────────────────────────────────────────────
import * as promotionsV2Zod from "../generated/promotions-and-taxes-api-v2/zod.gen.ts";
import * as promotionsV2Sdk from "../generated/promotions-and-taxes-api-v2/sdk.gen.ts";

export const promotionsAndTaxesV2Tools = [
  createToolFromOperation({
    id: "VTEX_PROMOTIONS_V2_GET_GROUPED_COUPONS",
    description: "Get grouped coupons.",
    annotations: { readOnlyHint: true },
    requestSchema: promotionsV2Zod.zGetgroupedcouponsData,
    sdkFn: promotionsV2Sdk.getgroupedcoupons as any,
  }),
  createToolFromOperation({
    id: "VTEX_PROMOTIONS_V2_GET_GROUPED_ARCHIVED_COUPONS",
    description: "Get grouped archived coupons.",
    annotations: { readOnlyHint: true },
    requestSchema: promotionsV2Zod.zGetgroupedarchivedcouponsData,
    sdkFn: promotionsV2Sdk.getgroupedarchivedcoupons as any,
  }),
  createToolFromOperation({
    id: "VTEX_PROMOTIONS_V2_GET_COUPON_GROUP_INFORMATION",
    description: "Get coupon group information.",
    annotations: { readOnlyHint: true },
    requestSchema: promotionsV2Zod.zGetcoupongroupinformationData,
    sdkFn: promotionsV2Sdk.getcoupongroupinformation as any,
  }),
  createToolFromOperation({
    id: "VTEX_PROMOTIONS_V2_EDIT_COUPON_GROUP_CONFIGURATION",
    description: "Edit coupon group configuration.",
    requestSchema: promotionsV2Zod.zEditcoupongroupconfigurationData,
    sdkFn: promotionsV2Sdk.editcoupongroupconfiguration as any,
  }),
  createToolFromOperation({
    id: "VTEX_PROMOTIONS_V2_GET_COUPON_GROUP_CODES",
    description: "Get all codes in a coupon group.",
    annotations: { readOnlyHint: true },
    requestSchema: promotionsV2Zod.zGetcoupongroupcodesData,
    sdkFn: promotionsV2Sdk.getcoupongroupcodes as any,
  }),
  createToolFromOperation({
    id: "VTEX_PROMOTIONS_V2_ARCHIVE_COUPON_GROUP",
    description: "Archive a coupon group.",
    requestSchema: promotionsV2Zod.zArchivedcoupongroupData,
    sdkFn: promotionsV2Sdk.archivedcoupongroup as any,
  }),
  createToolFromOperation({
    id: "VTEX_PROMOTIONS_V2_CREATE_GROUPS_OF_COUPONS",
    description: "Create groups of coupons.",
    requestSchema: promotionsV2Zod.zCreategroupsofcouponsData,
    sdkFn: promotionsV2Sdk.creategroupsofcoupons as any,
  }),
  createToolFromOperation({
    id: "VTEX_PROMOTIONS_V2_UNARCHIVE_COUPON_GROUP",
    description: "Unarchive a coupon group.",
    requestSchema: promotionsV2Zod.zUnarchivedcoupongroupData,
    sdkFn: promotionsV2Sdk.unarchivedcoupongroup as any,
  }),
  createToolFromOperation({
    id: "VTEX_PROMOTIONS_V2_GET_USAGES_OF_SINGLE_COUPON",
    description: "Get usage count of a single coupon.",
    annotations: { readOnlyHint: true },
    requestSchema: promotionsV2Zod.zGetnumberofusagesofasinglecouponData,
    sdkFn: promotionsV2Sdk.getnumberofusagesofasinglecoupon as any,
  }),
  createToolFromOperation({
    id: "VTEX_PROMOTIONS_V2_GET_USAGES_OF_COUPON_BATCH",
    description: "Get usage counts for a batch of coupons.",
    annotations: { readOnlyHint: true },
    requestSchema: promotionsV2Zod.zGetnumberofusagesofacouponbatchData,
    sdkFn: promotionsV2Sdk.getnumberofusagesofacouponbatch as any,
  }),
];

// ── Punchout ───────────────────────────────────────────────────────────────────
import * as punchoutZod from "../generated/punchout/zod.gen.ts";
import * as punchoutSdk from "../generated/punchout/sdk.gen.ts";

export const punchoutTools = [
  createToolFromOperation({
    id: "VTEX_PUNCHOUT_START",
    description: "Start a punchout session.",
    requestSchema: punchoutZod.zPostApiAuthenticatorPunchoutStartData,
    sdkFn: punchoutSdk.postApiAuthenticatorPunchoutStart as any,
  }),
  createToolFromOperation({
    id: "VTEX_PUNCHOUT_AUTHENTICATED_START",
    description: "Start an authenticated punchout session.",
    requestSchema:
      punchoutZod.zPostApiAuthenticatorPunchoutAuthenticatedStartData,
    sdkFn: punchoutSdk.postApiAuthenticatorPunchoutAuthenticatedStart as any,
  }),
  createToolFromOperation({
    id: "VTEX_PUNCHOUT_FINISH",
    description: "Finish a punchout session.",
    annotations: { readOnlyHint: true },
    requestSchema: punchoutZod.zGetApiAuthenticatorPunchoutFinishData,
    sdkFn: punchoutSdk.getApiAuthenticatorPunchoutFinish as any,
  }),
];

// ── Recommendations BFF ────────────────────────────────────────────────────────
import * as recommendationsBffZod from "../generated/recommendations-bff/zod.gen.ts";
import * as recommendationsBffSdk from "../generated/recommendations-bff/sdk.gen.ts";

export const recommendationsBffTools = [
  createToolFromOperation({
    id: "VTEX_RECOMMENDATIONS_VIEW_EVENT",
    description: "Send a recommendation view event.",
    requestSchema:
      recommendationsBffZod.zPostApiRecommendBffV2EventsRecommendationViewData,
    sdkFn:
      recommendationsBffSdk.postApiRecommendBffV2EventsRecommendationView as any,
  }),
  createToolFromOperation({
    id: "VTEX_RECOMMENDATIONS_CLICK_EVENT",
    description: "Send a recommendation click event.",
    requestSchema:
      recommendationsBffZod.zPostApiRecommendBffV2EventsRecommendationClickData,
    sdkFn:
      recommendationsBffSdk.postApiRecommendBffV2EventsRecommendationClick as any,
  }),
  createToolFromOperation({
    id: "VTEX_RECOMMENDATIONS_GET",
    description: "Get product recommendations.",
    annotations: { readOnlyHint: true },
    requestSchema:
      recommendationsBffZod.zGetApiRecommendBffV2RecommendationsData,
    sdkFn: recommendationsBffSdk.getApiRecommendBffV2Recommendations as any,
  }),
  createToolFromOperation({
    id: "VTEX_RECOMMENDATIONS_START_SESSION",
    description: "Start a user session for recommendations.",
    requestSchema:
      recommendationsBffZod.zPostApiRecommendBffV2UsersStartSessionData,
    sdkFn: recommendationsBffSdk.postApiRecommendBffV2UsersStartSession as any,
  }),
  createToolFromOperation({
    id: "VTEX_RECOMMENDATIONS_PRODUCT_VIEW_EVENT",
    description: "Send a product view event for recommendations.",
    requestSchema:
      recommendationsBffZod.zPostApiRecommendBffV2EventsProductViewData,
    sdkFn: recommendationsBffSdk.postApiRecommendBffV2EventsProductView as any,
  }),
];

// ── Reviews and Ratings ────────────────────────────────────────────────────────
import * as reviewsAndRatingsZod from "../generated/reviews-and-ratings/zod.gen.ts";
import * as reviewsAndRatingsSdk from "../generated/reviews-and-ratings/sdk.gen.ts";

export const reviewsAndRatingsTools = [
  createToolFromOperation({
    id: "VTEX_REVIEWS_GET_PRODUCT_RATING",
    description: "Get the rating for a product.",
    annotations: { readOnlyHint: true },
    requestSchema: reviewsAndRatingsZod.zGetProductRatingData,
    sdkFn: reviewsAndRatingsSdk.getProductRating as any,
  }),
  createToolFromOperation({
    id: "VTEX_REVIEWS_DELETE_REVIEW",
    description: "Delete a review by ID.",
    annotations: { destructiveHint: true },
    requestSchema: reviewsAndRatingsZod.zDeleteReviewData,
    sdkFn: reviewsAndRatingsSdk.deleteReview as any,
  }),
  createToolFromOperation({
    id: "VTEX_REVIEWS_GET_REVIEW_BY_ID",
    description: "Get a review by review ID.",
    annotations: { readOnlyHint: true },
    requestSchema: reviewsAndRatingsZod.zGetReviewbyReviewIdData,
    sdkFn: reviewsAndRatingsSdk.getReviewbyReviewId as any,
  }),
  createToolFromOperation({
    id: "VTEX_REVIEWS_EDIT_REVIEW",
    description: "Edit a review by ID.",
    requestSchema: reviewsAndRatingsZod.zEditReviewData,
    sdkFn: reviewsAndRatingsSdk.editReview as any,
  }),
  createToolFromOperation({
    id: "VTEX_REVIEWS_DELETE_MULTIPLE_REVIEWS",
    description: "Delete multiple reviews.",
    annotations: { destructiveHint: true },
    requestSchema: reviewsAndRatingsZod.zDeleteMultipleReviewsData,
    sdkFn: reviewsAndRatingsSdk.deleteMultipleReviews as any,
  }),
  createToolFromOperation({
    id: "VTEX_REVIEWS_GET_LIST_OF_REVIEWS",
    description: "Get a list of reviews.",
    annotations: { readOnlyHint: true },
    requestSchema: reviewsAndRatingsZod.zGetalistofReviewsData,
    sdkFn: reviewsAndRatingsSdk.getalistofReviews as any,
  }),
  createToolFromOperation({
    id: "VTEX_REVIEWS_SAVE_MULTIPLE_REVIEWS",
    description: "Save multiple reviews.",
    requestSchema: reviewsAndRatingsZod.zSaveMultipleReviewsData,
    sdkFn: reviewsAndRatingsSdk.saveMultipleReviews as any,
  }),
  createToolFromOperation({
    id: "VTEX_REVIEWS_SAVE_REVIEW",
    description: "Save a review.",
    requestSchema: reviewsAndRatingsZod.zSaveReviewData,
    sdkFn: reviewsAndRatingsSdk.saveReview as any,
  }),
];

// ── Search (Legacy VTEX Search API) ───────────────────────────────────────────
import * as searchZod from "../generated/search/zod.gen.ts";
import * as searchSdk from "../generated/search/sdk.gen.ts";

export const searchTools = [
  createToolFromOperation({
    id: "VTEX_SEARCH_WHO_SAW_ALSO_SAW",
    description: "Get products that customers who saw this product also saw.",
    annotations: { readOnlyHint: true },
    requestSchema: searchZod.zProductSearchWhoSawAlsoSawData,
    sdkFn: searchSdk.productSearchWhoSawAlsoSaw as any,
  }),
  createToolFromOperation({
    id: "VTEX_SEARCH_WHO_SAW_ALSO_BOUGHT",
    description:
      "Get products that customers who saw this product also bought.",
    annotations: { readOnlyHint: true },
    requestSchema: searchZod.zProductSearchWhoSawAlsoBoughtData,
    sdkFn: searchSdk.productSearchWhoSawAlsoBought as any,
  }),
  createToolFromOperation({
    id: "VTEX_SEARCH_WHO_BOUGHT_ALSO_BOUGHT",
    description:
      "Get products that customers who bought this product also bought.",
    annotations: { readOnlyHint: true },
    requestSchema: searchZod.zProductSearchWhoBoughtAlsoBoughtData,
    sdkFn: searchSdk.productSearchWhoBoughtAlsoBought as any,
  }),
  createToolFromOperation({
    id: "VTEX_SEARCH_SHOW_TOGETHER",
    description: "Get products that are shown together with this product.",
    annotations: { readOnlyHint: true },
    requestSchema: searchZod.zProductSearchShowTogetherData,
    sdkFn: searchSdk.productSearchShowTogether as any,
  }),
  createToolFromOperation({
    id: "VTEX_SEARCH_ACCESSORIES",
    description: "Get product accessories.",
    annotations: { readOnlyHint: true },
    requestSchema: searchZod.zProductSearchAccessoriesData,
    sdkFn: searchSdk.productSearchAccessories as any,
  }),
  createToolFromOperation({
    id: "VTEX_SEARCH_SIMILARS",
    description: "Get similar products.",
    annotations: { readOnlyHint: true },
    requestSchema: searchZod.zProductSearchSimilarsData,
    sdkFn: searchSdk.productSearchSimilars as any,
  }),
  createToolFromOperation({
    id: "VTEX_SEARCH_SUGGESTIONS",
    description: "Get product search suggestions.",
    annotations: { readOnlyHint: true },
    requestSchema: searchZod.zProductSearchSuggestionsData,
    sdkFn: searchSdk.productSearchSuggestions as any,
  }),
  createToolFromOperation({
    id: "VTEX_SEARCH_PRODUCTS",
    description: "Search for products using the legacy VTEX search API.",
    annotations: { readOnlyHint: true },
    requestSchema: searchZod.zProductSearchData,
    sdkFn: searchSdk.productSearch as any,
  }),
  createToolFromOperation({
    id: "VTEX_SEARCH_PRODUCTS_FILTERED_AND_ORDERED",
    description: "Search for products with filtering and ordering options.",
    annotations: { readOnlyHint: true },
    requestSchema: searchZod.zProductSearchFilteredandOrderedData,
    sdkFn: searchSdk.productSearchFilteredandOrdered as any,
  }),
  createToolFromOperation({
    id: "VTEX_SEARCH_BY_PRODUCT_URL",
    description: "Search for a product by its URL.",
    annotations: { readOnlyHint: true },
    requestSchema: searchZod.zSearchbyproducturlData,
    sdkFn: searchSdk.searchbyproducturl as any,
  }),
  createToolFromOperation({
    id: "VTEX_SEARCH_GET_PRODUCT_OFFERS",
    description: "Get offers for a product.",
    annotations: { readOnlyHint: true },
    requestSchema:
      searchZod.zGetApiCatalogSystemPubProductsOffersByProductIdData,
    sdkFn: searchSdk.getApiCatalogSystemPubProductsOffersByProductId as any,
  }),
  createToolFromOperation({
    id: "VTEX_SEARCH_GET_SKU_OFFERS",
    description: "Get offers for a specific SKU.",
    annotations: { readOnlyHint: true },
    requestSchema:
      searchZod.zGetApiCatalogSystemPubProductsOffersByProductIdSkuBySkuIdData,
    sdkFn:
      searchSdk.getApiCatalogSystemPubProductsOffersByProductIdSkuBySkuId as any,
  }),
  createToolFromOperation({
    id: "VTEX_SEARCH_GET_FACETS_BY_CATEGORY_ID",
    description: "Get search facets by category ID.",
    annotations: { readOnlyHint: true },
    requestSchema:
      searchZod.zGetApiCatalogSystemPubFacetsCategoryByCategoryIdData,
    sdkFn: searchSdk.getApiCatalogSystemPubFacetsCategoryByCategoryId as any,
  }),
  createToolFromOperation({
    id: "VTEX_SEARCH_FACETS_CATEGORY",
    description: "Get facets for a category.",
    annotations: { readOnlyHint: true },
    requestSchema: searchZod.zFacetscategoryData,
    sdkFn: searchSdk.facetscategory as any,
  }),
  createToolFromOperation({
    id: "VTEX_SEARCH_AUTOCOMPLETE",
    description: "Get autocomplete suggestions for a search term.",
    annotations: { readOnlyHint: true },
    requestSchema: searchZod.zAutoCompleteData,
    sdkFn: searchSdk.autoComplete as any,
  }),
];

// ── Session Manager ────────────────────────────────────────────────────────────
import * as sessionManagerZod from "../generated/session-manager/zod.gen.ts";
import * as sessionManagerSdk from "../generated/session-manager/sdk.gen.ts";

export const sessionManagerTools = [
  createToolFromOperation({
    id: "VTEX_SESSION_GET",
    description: "Get the current session.",
    annotations: { readOnlyHint: true },
    requestSchema: sessionManagerZod.zGetSessionData,
    sdkFn: sessionManagerSdk.getSession as any,
  }),
  createToolFromOperation({
    id: "VTEX_SESSION_EDIT",
    description: "Edit the current session.",
    requestSchema: sessionManagerZod.zEditsessionData,
    sdkFn: sessionManagerSdk.editsession as any,
  }),
  createToolFromOperation({
    id: "VTEX_SESSION_CREATE_NEW",
    description: "Create a new session.",
    requestSchema: sessionManagerZod.zCreatenewsessionData,
    sdkFn: sessionManagerSdk.createnewsession as any,
  }),
  createToolFromOperation({
    id: "VTEX_SESSION_GET_SEGMENT",
    description: "Get the current segment.",
    annotations: { readOnlyHint: true },
    requestSchema: sessionManagerZod.zGetSegmentData,
    sdkFn: sessionManagerSdk.getSegment as any,
  }),
];

// ── SKU Bindings ───────────────────────────────────────────────────────────────
import * as skuBindingsZod from "../generated/sku-bindings/zod.gen.ts";
import * as skuBindingsSdk from "../generated/sku-bindings/sdk.gen.ts";

export const skuBindingsTools = [
  createToolFromOperation({
    id: "VTEX_SKU_BINDINGS_GET_BY_SKU_ID",
    description: "Get SKU binding by SKU ID.",
    annotations: { readOnlyHint: true },
    requestSchema: skuBindingsZod.zGetbySkuIdData,
    sdkFn: skuBindingsSdk.getbySkuId as any,
  }),
  createToolFromOperation({
    id: "VTEX_SKU_BINDINGS_GET_PAGED_ADMIN",
    description: "Get paged SKU bindings (admin).",
    annotations: { readOnlyHint: true },
    requestSchema: skuBindingsZod.zGetpagedadminData,
    sdkFn: skuBindingsSdk.getpagedadmin as any,
  }),
  createToolFromOperation({
    id: "VTEX_SKU_BINDINGS_GET_SKU_SELLER",
    description: "Get SKU seller binding.",
    annotations: { readOnlyHint: true },
    requestSchema: skuBindingsZod.zGetSkUsellerData,
    sdkFn: skuBindingsSdk.getSkUseller as any,
  }),
  createToolFromOperation({
    id: "VTEX_SKU_BINDINGS_BIND_TO_ANOTHER_SKU",
    description: "Bind a SKU to another SKU.",
    requestSchema: skuBindingsZod.zBindtoanotherskuData,
    sdkFn: skuBindingsSdk.bindtoanothersku as any,
  }),
  createToolFromOperation({
    id: "VTEX_SKU_BINDINGS_GET_ALL_BY_SELLER_ID",
    description: "Get all SKU bindings for a seller.",
    annotations: { readOnlyHint: true },
    requestSchema: skuBindingsZod.zGetallbySellerIdData,
    sdkFn: skuBindingsSdk.getallbySellerId as any,
  }),
  createToolFromOperation({
    id: "VTEX_SKU_BINDINGS_GET_PAGED_BY_SELLER_ID",
    description: "Get paged SKU bindings for a seller.",
    annotations: { readOnlyHint: true },
    requestSchema: skuBindingsZod.zGetpagedbySellerIdData,
    sdkFn: skuBindingsSdk.getpagedbySellerId as any,
  }),
  createToolFromOperation({
    id: "VTEX_SKU_BINDINGS_CHANGE_NOTIFICATION",
    description: "Send a change notification for SKU bindings.",
    requestSchema: skuBindingsZod.zChangeNotificationData,
    sdkFn: skuBindingsSdk.changeNotification as any,
  }),
  createToolFromOperation({
    id: "VTEX_SKU_BINDINGS_POST_CHANGE_NOTIFICATION",
    description: "Post a seller SKU change notification.",
    requestSchema:
      skuBindingsZod.zPostSkuBindingPvtSkusellerChangenotificationBySellerIdBySellerSkuIdData,
    sdkFn:
      skuBindingsSdk.postSkuBindingPvtSkusellerChangenotificationBySellerIdBySellerSkuId as any,
  }),
  createToolFromOperation({
    id: "VTEX_SKU_BINDINGS_INSERT",
    description: "Insert a new SKU binding.",
    requestSchema: skuBindingsZod.zInsertSkuBindingData,
    sdkFn: skuBindingsSdk.insertSkuBinding as any,
  }),
  createToolFromOperation({
    id: "VTEX_SKU_BINDINGS_ACTIVATE",
    description: "Activate a SKU binding.",
    requestSchema: skuBindingsZod.zActivateSkuBindingData,
    sdkFn: skuBindingsSdk.activateSkuBinding as any,
  }),
  createToolFromOperation({
    id: "VTEX_SKU_BINDINGS_DEACTIVATE",
    description: "Deactivate a SKU binding.",
    requestSchema: skuBindingsZod.zDeactivateSkuBindingData,
    sdkFn: skuBindingsSdk.deactivateSkuBinding as any,
  }),
  createToolFromOperation({
    id: "VTEX_SKU_BINDINGS_DELETE_SELLER_ASSOCIATION",
    description: "Delete a SKU seller association.",
    annotations: { destructiveHint: true },
    requestSchema: skuBindingsZod.zDeleteSkUsellerassociationData,
    sdkFn: skuBindingsSdk.deleteSkUsellerassociation as any,
  }),
];

// ── SSL Certificates ───────────────────────────────────────────────────────────
import * as sslCertificatesZod from "../generated/ssl-certificates/zod.gen.ts";
import * as sslCertificatesSdk from "../generated/ssl-certificates/sdk.gen.ts";

export const sslCertificatesTools = [
  createToolFromOperation({
    id: "VTEX_SSL_GET_CERTIFICATES",
    description: "Get all SSL certificates.",
    annotations: { readOnlyHint: true },
    requestSchema: sslCertificatesZod.zGetApiEdgeCertificatesData,
    sdkFn: sslCertificatesSdk.getApiEdgeCertificates as any,
  }),
  createToolFromOperation({
    id: "VTEX_SSL_PUT_CERTIFICATES",
    description: "Create or update SSL certificates.",
    requestSchema: sslCertificatesZod.zPutApiEdgeCertificatesData,
    sdkFn: sslCertificatesSdk.putApiEdgeCertificates as any,
  }),
  createToolFromOperation({
    id: "VTEX_SSL_GET_CERTIFICATE_BY_ID",
    description: "Get an SSL certificate by ID.",
    annotations: { readOnlyHint: true },
    requestSchema:
      sslCertificatesZod.zGetApiEdgeCertificatesByCertificateIdData,
    sdkFn: sslCertificatesSdk.getApiEdgeCertificatesByCertificateId as any,
  }),
];

// ── Storefront Permissions ─────────────────────────────────────────────────────
import * as storefrontPermissionsZod from "../generated/storefront-permissions/zod.gen.ts";
import * as storefrontPermissionsSdk from "../generated/storefront-permissions/sdk.gen.ts";

export const storefrontPermissionsTools = [
  createToolFromOperation({
    id: "VTEX_STOREFRONT_PERMISSIONS_ASSIGN_ROLE",
    description: "Assign a role to a user in storefront permissions.",
    requestSchema:
      storefrontPermissionsZod.zPostApiLicenseManagerStorefrontRolesAssignData,
    sdkFn:
      storefrontPermissionsSdk.postApiLicenseManagerStorefrontRolesAssign as any,
  }),
  createToolFromOperation({
    id: "VTEX_STOREFRONT_PERMISSIONS_REVOKE_ROLE",
    description: "Revoke a role from a user in storefront permissions.",
    annotations: { destructiveHint: true },
    requestSchema:
      storefrontPermissionsZod.zDeleteApiLicenseManagerStorefrontRolesRevokeData,
    sdkFn:
      storefrontPermissionsSdk.deleteApiLicenseManagerStorefrontRolesRevoke as any,
  }),
  createToolFromOperation({
    id: "VTEX_STOREFRONT_PERMISSIONS_CREATE_USER",
    description: "Create a user in storefront permissions.",
    requestSchema:
      storefrontPermissionsZod.zPostApiLicenseManagerStorefrontUsersData,
    sdkFn: storefrontPermissionsSdk.postApiLicenseManagerStorefrontUsers as any,
  }),
  createToolFromOperation({
    id: "VTEX_STOREFRONT_PERMISSIONS_CHECK_RESOURCE_GRANTED",
    description: "Check if a resource is granted to a user.",
    annotations: { readOnlyHint: true },
    requestSchema:
      storefrontPermissionsZod.zGetApiLicenseManagerStorefrontUsersByUserIdResourcesByResourceKeyGrantedData,
    sdkFn:
      storefrontPermissionsSdk.getApiLicenseManagerStorefrontUsersByUserIdResourcesByResourceKeyGranted as any,
  }),
  createToolFromOperation({
    id: "VTEX_STOREFRONT_PERMISSIONS_REMOVE_USER",
    description: "Remove a user from storefront permissions.",
    annotations: { destructiveHint: true },
    requestSchema:
      storefrontPermissionsZod.zDeleteApiLicenseManagerStorefrontRemoveUsersByUserIdData,
    sdkFn:
      storefrontPermissionsSdk.deleteApiLicenseManagerStorefrontRemoveUsersByUserId as any,
  }),
  createToolFromOperation({
    id: "VTEX_STOREFRONT_PERMISSIONS_GET_USER_ROLES",
    description: "Get roles for a user in storefront permissions.",
    annotations: { readOnlyHint: true },
    requestSchema:
      storefrontPermissionsZod.zGetApiLicenseManagerStorefrontUsersByUserIdRolesData,
    sdkFn:
      storefrontPermissionsSdk.getApiLicenseManagerStorefrontUsersByUserIdRoles as any,
  }),
  createToolFromOperation({
    id: "VTEX_STOREFRONT_PERMISSIONS_GET_USER_ROLES_BY_EMAIL",
    description: "Get roles for a user by email in storefront permissions.",
    annotations: { readOnlyHint: true },
    requestSchema:
      storefrontPermissionsZod.zGetApiLicenseManagerStorefrontUsersByEmailRolesData,
    sdkFn:
      storefrontPermissionsSdk.getApiLicenseManagerStorefrontUsersByEmailRoles as any,
  }),
  createToolFromOperation({
    id: "VTEX_STOREFRONT_PERMISSIONS_GET_USER",
    description: "Get a user by ID in storefront permissions.",
    annotations: { readOnlyHint: true },
    requestSchema:
      storefrontPermissionsZod.zGetApiLicenseManagerStorefrontUsersByUserIdData,
    sdkFn:
      storefrontPermissionsSdk.getApiLicenseManagerStorefrontUsersByUserId as any,
  }),
];

// ── Subscriptions API v3 ───────────────────────────────────────────────────────
import * as subscriptionsV3Zod from "../generated/subscriptions-api-v3/zod.gen.ts";
import * as subscriptionsV3Sdk from "../generated/subscriptions-api-v3/sdk.gen.ts";

export const subscriptionsV3Tools = [
  createToolFromOperation({
    id: "VTEX_SUBSCRIPTIONS_GET_CYCLE_BY_ID",
    description: "Get a subscription cycle by ID.",
    annotations: { readOnlyHint: true },
    requestSchema: subscriptionsV3Zod.zGetApiRnsPubCyclesByCycleIdData,
    sdkFn: subscriptionsV3Sdk.getApiRnsPubCyclesByCycleId as any,
  }),
  createToolFromOperation({
    id: "VTEX_SUBSCRIPTIONS_GET_CYCLES",
    description: "Get all subscription cycles.",
    annotations: { readOnlyHint: true },
    requestSchema: subscriptionsV3Zod.zGetApiRnsPubCyclesData,
    sdkFn: subscriptionsV3Sdk.getApiRnsPubCycles as any,
  }),
  createToolFromOperation({
    id: "VTEX_SUBSCRIPTIONS_RETRY_CYCLE",
    description: "Retry a failed subscription cycle.",
    requestSchema: subscriptionsV3Zod.zPostApiRnsPubCyclesByCycleIdRetryData,
    sdkFn: subscriptionsV3Sdk.postApiRnsPubCyclesByCycleIdRetry as any,
  }),
  createToolFromOperation({
    id: "VTEX_SUBSCRIPTIONS_GET_PLANS",
    description: "Get all subscription plans.",
    annotations: { readOnlyHint: true },
    requestSchema: subscriptionsV3Zod.zGetApiRnsPvtPlansData,
    sdkFn: subscriptionsV3Sdk.getApiRnsPvtPlans as any,
  }),
  createToolFromOperation({
    id: "VTEX_SUBSCRIPTIONS_GET_PLAN_BY_ID",
    description: "Get a subscription plan by ID.",
    annotations: { readOnlyHint: true },
    requestSchema: subscriptionsV3Zod.zGetApiRnsPvtPlansByIdData,
    sdkFn: subscriptionsV3Sdk.getApiRnsPvtPlansById as any,
  }),
  createToolFromOperation({
    id: "VTEX_SUBSCRIPTIONS_GET_REPORTS",
    description: "Get subscription reports.",
    annotations: { readOnlyHint: true },
    requestSchema: subscriptionsV3Zod.zGetApiRnsPvtReportsData,
    sdkFn: subscriptionsV3Sdk.getApiRnsPvtReports as any,
  }),
  createToolFromOperation({
    id: "VTEX_SUBSCRIPTIONS_GET_REPORT_DOCUMENT",
    description: "Get a specific subscription report document.",
    annotations: { readOnlyHint: true },
    requestSchema:
      subscriptionsV3Zod.zGetApiRnsPvtReportsByReportNameDocumentsByDocumentIdData,
    sdkFn:
      subscriptionsV3Sdk.getApiRnsPvtReportsByReportNameDocumentsByDocumentId as any,
  }),
  createToolFromOperation({
    id: "VTEX_SUBSCRIPTIONS_POST_REPORT_DOCUMENT",
    description: "Create a subscription report document.",
    requestSchema:
      subscriptionsV3Zod.zPostApiRnsPvtReportsByReportNameDocumentsData,
    sdkFn: subscriptionsV3Sdk.postApiRnsPvtReportsByReportNameDocuments as any,
  }),
  createToolFromOperation({
    id: "VTEX_SUBSCRIPTIONS_GET_BY_ID",
    description: "Get a subscription by ID.",
    annotations: { readOnlyHint: true },
    requestSchema: subscriptionsV3Zod.zGetApiRnsPubSubscriptionsByIdData,
    sdkFn: subscriptionsV3Sdk.getApiRnsPubSubscriptionsById as any,
  }),
  createToolFromOperation({
    id: "VTEX_SUBSCRIPTIONS_PATCH_BY_ID",
    description: "Update a subscription by ID.",
    requestSchema: subscriptionsV3Zod.zPatchApiRnsPubSubscriptionsByIdData,
    sdkFn: subscriptionsV3Sdk.patchApiRnsPubSubscriptionsById as any,
  }),
  createToolFromOperation({
    id: "VTEX_SUBSCRIPTIONS_GET_ALL",
    description: "Get all subscriptions.",
    annotations: { readOnlyHint: true },
    requestSchema: subscriptionsV3Zod.zGetApiRnsPubSubscriptionsData,
    sdkFn: subscriptionsV3Sdk.getApiRnsPubSubscriptions as any,
  }),
  createToolFromOperation({
    id: "VTEX_SUBSCRIPTIONS_CREATE",
    description: "Create a new subscription.",
    requestSchema: subscriptionsV3Zod.zPostApiRnsPubSubscriptionsData,
    sdkFn: subscriptionsV3Sdk.postApiRnsPubSubscriptions as any,
  }),
  createToolFromOperation({
    id: "VTEX_SUBSCRIPTIONS_DELETE_ITEM",
    description: "Delete an item from a subscription.",
    annotations: { destructiveHint: true },
    requestSchema:
      subscriptionsV3Zod.zDeleteApiRnsPubSubscriptionsByIdItemsByItemIdData,
    sdkFn:
      subscriptionsV3Sdk.deleteApiRnsPubSubscriptionsByIdItemsByItemId as any,
  }),
  createToolFromOperation({
    id: "VTEX_SUBSCRIPTIONS_PATCH_ITEM",
    description: "Update an item in a subscription.",
    requestSchema:
      subscriptionsV3Zod.zPatchApiRnsPubSubscriptionsByIdItemsByItemIdData,
    sdkFn:
      subscriptionsV3Sdk.patchApiRnsPubSubscriptionsByIdItemsByItemId as any,
  }),
  createToolFromOperation({
    id: "VTEX_SUBSCRIPTIONS_POST_ITEM",
    description: "Add an item to a subscription.",
    requestSchema: subscriptionsV3Zod.zPostApiRnsPubSubscriptionsByIdItemsData,
    sdkFn: subscriptionsV3Sdk.postApiRnsPubSubscriptionsByIdItems as any,
  }),
  createToolFromOperation({
    id: "VTEX_SUBSCRIPTIONS_SIMULATE",
    description: "Simulate a subscription order.",
    requestSchema:
      subscriptionsV3Zod.zPostApiRnsPubSubscriptionsByIdSimulateData,
    sdkFn: subscriptionsV3Sdk.postApiRnsPubSubscriptionsByIdSimulate as any,
  }),
  createToolFromOperation({
    id: "VTEX_SUBSCRIPTIONS_BULK_SIMULATE",
    description: "Simulate multiple subscription orders.",
    requestSchema: subscriptionsV3Zod.zPostApiRnsPubSubscriptionsSimulateData,
    sdkFn: subscriptionsV3Sdk.postApiRnsPubSubscriptionsSimulate as any,
  }),
  createToolFromOperation({
    id: "VTEX_SUBSCRIPTIONS_GET_CONVERSATION_MESSAGE",
    description: "Get conversation messages for a subscription.",
    annotations: { readOnlyHint: true },
    requestSchema:
      subscriptionsV3Zod.zGetApiRnsPubSubscriptionsBySubscriptionIdConversationMessageData,
    sdkFn:
      subscriptionsV3Sdk.getApiRnsPubSubscriptionsBySubscriptionIdConversationMessage as any,
  }),
  createToolFromOperation({
    id: "VTEX_SUBSCRIPTIONS_GET_SETTINGS",
    description: "Get subscription settings.",
    annotations: { readOnlyHint: true },
    requestSchema: subscriptionsV3Zod.zGetSettingsData,
    sdkFn: subscriptionsV3Sdk.getSettings as any,
  }),
  createToolFromOperation({
    id: "VTEX_SUBSCRIPTIONS_EDIT_SETTINGS",
    description: "Edit subscription settings.",
    requestSchema: subscriptionsV3Zod.zEditSettingsData,
    sdkFn: subscriptionsV3Sdk.editSettings as any,
  }),
];

// ── Tracking ───────────────────────────────────────────────────────────────────
import * as trackingZod from "../generated/tracking/zod.gen.ts";
import * as trackingSdk from "../generated/tracking/sdk.gen.ts";

export const trackingTools = [
  createToolFromOperation({
    id: "VTEX_TRACKING_POST_AUTH",
    description: "Authenticate with the tracking service.",
    requestSchema: trackingZod.zPostAuthData,
    sdkFn: trackingSdk.postAuth as any,
  }),
  createToolFromOperation({
    id: "VTEX_TRACKING_GET_SERVICES",
    description: "Get all tracking services.",
    annotations: { readOnlyHint: true },
    requestSchema: trackingZod.zGetServicesData,
    sdkFn: trackingSdk.getServices as any,
  }),
  createToolFromOperation({
    id: "VTEX_TRACKING_POST_SERVICE",
    description: "Create a new tracking service.",
    requestSchema: trackingZod.zPostServicesData,
    sdkFn: trackingSdk.postServices as any,
  }),
  createToolFromOperation({
    id: "VTEX_TRACKING_PUT_SERVICE",
    description: "Update a tracking service.",
    requestSchema: trackingZod.zPutServicesData,
    sdkFn: trackingSdk.putServices as any,
  }),
  createToolFromOperation({
    id: "VTEX_TRACKING_GET_SERVICE_DELIVERY",
    description: "Get delivery details for a tracking service.",
    annotations: { readOnlyHint: true },
    requestSchema: trackingZod.zGetServicesByIdDeliveryServiceData,
    sdkFn: trackingSdk.getServicesByIdDeliveryService as any,
  }),
  createToolFromOperation({
    id: "VTEX_TRACKING_GET_SERVICE_ROUTES",
    description: "Get routes for tracking services.",
    annotations: { readOnlyHint: true },
    requestSchema: trackingZod.zGetServicesRoutesData,
    sdkFn: trackingSdk.getServicesRoutes as any,
  }),
  createToolFromOperation({
    id: "VTEX_TRACKING_POST_DELIVERY_SERVICE_WITH_ROUTE",
    description: "Create a delivery service with route asynchronously.",
    requestSchema: trackingZod.zPostDeliveryServiceWithRouteAsyncData,
    sdkFn: trackingSdk.postDeliveryServiceWithRouteAsync as any,
  }),
  createToolFromOperation({
    id: "VTEX_TRACKING_GET_SERVICES_INVOICE",
    description: "Get invoice for tracking services.",
    annotations: { readOnlyHint: true },
    requestSchema: trackingZod.zGetServicesInvoiceData,
    sdkFn: trackingSdk.getServicesInvoice as any,
  }),
];

// ── VTEX DO ────────────────────────────────────────────────────────────────────
import * as vtexDoZod from "../generated/vtex-do/zod.gen.ts";
import * as vtexDoSdk from "../generated/vtex-do/sdk.gen.ts";

export const vtexDoTools = [
  createToolFromOperation({
    id: "VTEX_DO_GET_NOTES_BY_ORDER_ID",
    description: "Get notes for a specific order.",
    annotations: { readOnlyHint: true },
    requestSchema: vtexDoZod.zGetNotesbyorderIdData,
    sdkFn: vtexDoSdk.getNotesbyorderId as any,
  }),
  createToolFromOperation({
    id: "VTEX_DO_NEW_NOTE",
    description: "Create a new note.",
    requestSchema: vtexDoZod.zNewNoteData,
    sdkFn: vtexDoSdk.newNote as any,
  }),
  createToolFromOperation({
    id: "VTEX_DO_GET_NOTE",
    description: "Get a note by ID.",
    annotations: { readOnlyHint: true },
    requestSchema: vtexDoZod.zGetNoteData,
    sdkFn: vtexDoSdk.getNote as any,
  }),
  createToolFromOperation({
    id: "VTEX_DO_LIST_TASKS_BY_ASSIGNEE",
    description: "List tasks assigned to a specific user.",
    annotations: { readOnlyHint: true },
    requestSchema: vtexDoZod.zListtasksbyassigneeData,
    sdkFn: vtexDoSdk.listtasksbyassignee as any,
  }),
  createToolFromOperation({
    id: "VTEX_DO_NEW_TASK",
    description: "Create a new task.",
    requestSchema: vtexDoZod.zNewTaskData,
    sdkFn: vtexDoSdk.newTask as any,
  }),
  createToolFromOperation({
    id: "VTEX_DO_GET_TASK",
    description: "Get a task by ID.",
    annotations: { readOnlyHint: true },
    requestSchema: vtexDoZod.zGetTaskData,
    sdkFn: vtexDoSdk.getTask as any,
  }),
  createToolFromOperation({
    id: "VTEX_DO_EDIT_TASK",
    description: "Edit a task by ID.",
    requestSchema: vtexDoZod.zEditTaskData,
    sdkFn: vtexDoSdk.editTask as any,
  }),
  createToolFromOperation({
    id: "VTEX_DO_ADD_COMMENT",
    description: "Add a comment to a task.",
    requestSchema: vtexDoZod.zAddCommentData,
    sdkFn: vtexDoSdk.addComment as any,
  }),
];

// ── VTEX ID ────────────────────────────────────────────────────────────────────
import * as vtexIdZod from "../generated/vtex-id/zod.gen.ts";
import * as vtexIdSdk from "../generated/vtex-id/sdk.gen.ts";

export const vtexIdTools = [
  createToolFromOperation({
    id: "VTEX_ID_POST_STOREFRONT_USERS",
    description: "Create storefront users.",
    requestSchema: vtexIdZod.zPostApiAuthenticatorStorefrontUsersData,
    sdkFn: vtexIdSdk.postApiAuthenticatorStorefrontUsers as any,
  }),
  createToolFromOperation({
    id: "VTEX_ID_GET_USER_INFO",
    description: "Get user info from VTEX ID.",
    annotations: { readOnlyHint: true },
    requestSchema: vtexIdZod.zGetApiVtexidPvtUserInfoData,
    sdkFn: vtexIdSdk.getApiVtexidPvtUserInfo as any,
  }),
  createToolFromOperation({
    id: "VTEX_ID_APP_TOKEN_LOGIN",
    description: "Login with an app token.",
    requestSchema: vtexIdZod.zPostApiVtexidApptokenLoginData,
    sdkFn: vtexIdSdk.postApiVtexidApptokenLogin as any,
  }),
  createToolFromOperation({
    id: "VTEX_ID_OAUTH_EXCHANGE",
    description: "Exchange an OAuth token.",
    requestSchema:
      vtexIdZod.zPostApiVtexidAudienceWebstoreProviderOauthExchangeData,
    sdkFn: vtexIdSdk.postApiVtexidAudienceWebstoreProviderOauthExchange as any,
  }),
  createToolFromOperation({
    id: "VTEX_ID_CREDENTIAL_VALIDATE",
    description: "Validate credentials.",
    requestSchema: vtexIdZod.zPostApiVtexidCredentialValidateData,
    sdkFn: vtexIdSdk.postApiVtexidCredentialValidate as any,
  }),
  createToolFromOperation({
    id: "VTEX_ID_SETUP_PASSWORD",
    description: "Set up a webstore password.",
    requestSchema:
      vtexIdZod.zPostApiVtexidPubProvidersSetupPasswordWebstorePasswordData,
    sdkFn:
      vtexIdSdk.postApiVtexidPubProvidersSetupPasswordWebstorePassword as any,
  }),
  createToolFromOperation({
    id: "VTEX_ID_EXPIRE_PASSWORD",
    description: "Expire a user password.",
    requestSchema: vtexIdZod.zPostApiVtexidPasswordExpireData,
    sdkFn: vtexIdSdk.postApiVtexidPasswordExpire as any,
  }),
  createToolFromOperation({
    id: "VTEX_ID_RENEW_API_TOKEN",
    description: "Renew an API token.",
    requestSchema: vtexIdZod.zPatchApiVtexidApikeyByApiKeyApitokenRenewData,
    sdkFn: vtexIdSdk.patchApiVtexidApikeyByApiKeyApitokenRenew as any,
  }),
  createToolFromOperation({
    id: "VTEX_ID_FINISH_TOKEN_RENEWAL",
    description: "Finish an API token renewal.",
    requestSchema:
      vtexIdZod.zPatchApiVtexidApikeyByApiKeyApitokenFinishRenewalData,
    sdkFn: vtexIdSdk.patchApiVtexidApikeyByApiKeyApitokenFinishRenewal as any,
  }),
  createToolFromOperation({
    id: "VTEX_ID_GET_USER_ID",
    description: "Get user ID from VTEX ID.",
    annotations: { readOnlyHint: true },
    requestSchema: vtexIdZod.zGetApiVtexidPvtUserIdData,
    sdkFn: vtexIdSdk.getApiVtexidPvtUserId as any,
  }),
  createToolFromOperation({
    id: "VTEX_ID_GET_AUTHENTICATION_START",
    description: "Get authentication start URL.",
    annotations: { readOnlyHint: true },
    requestSchema: vtexIdZod.zGetApiVtexidPubAuthenticationStartData,
    sdkFn: vtexIdSdk.getApiVtexidPubAuthenticationStart as any,
  }),
  createToolFromOperation({
    id: "VTEX_ID_SEND_ACCESS_KEY",
    description: "Send an access key for authentication.",
    requestSchema: vtexIdZod.zPostApiVtexidPubAuthenticationAccesskeySendData,
    sdkFn: vtexIdSdk.postApiVtexidPubAuthenticationAccesskeySend as any,
  }),
  createToolFromOperation({
    id: "VTEX_ID_VALIDATE_ACCESS_KEY",
    description: "Validate an access key for authentication.",
    requestSchema:
      vtexIdZod.zPostApiVtexidPubAuthenticationAccesskeyValidateData,
    sdkFn: vtexIdSdk.postApiVtexidPubAuthenticationAccesskeyValidate as any,
  }),
  createToolFromOperation({
    id: "VTEX_ID_REFRESH_TOKEN",
    description: "Refresh a webstore authentication token.",
    requestSchema: vtexIdZod.zPostApiVtexidRefreshtokenWebstoreData,
    sdkFn: vtexIdSdk.postApiVtexidRefreshtokenWebstore as any,
  }),
];

// ── VTEX Shipping Network ──────────────────────────────────────────────────────
import * as vtexShippingNetworkZod from "../generated/vtex-shipping-network/zod.gen.ts";
import * as vtexShippingNetworkSdk from "../generated/vtex-shipping-network/sdk.gen.ts";

export const vtexShippingNetworkTools = [
  createToolFromOperation({
    id: "VTEX_SHIPPING_NETWORK_NOTIFY_CARRIER_WITH_APP",
    description: "Notify a carrier using the VTEX Shipping Network app.",
    requestSchema: vtexShippingNetworkZod.zNotifyCarrierwithAppData,
    sdkFn: vtexShippingNetworkSdk.notifyCarrierwithApp as any,
  }),
  createToolFromOperation({
    id: "VTEX_SHIPPING_NETWORK_TRACKING_EVENTS",
    description: "Get tracking events from the VTEX Shipping Network.",
    annotations: { readOnlyHint: true },
    requestSchema: vtexShippingNetworkZod.zTrackingEventsData,
    sdkFn: vtexShippingNetworkSdk.trackingEvents as any,
  }),
];
