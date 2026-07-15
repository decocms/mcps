/**
 * Products & collections tools (read-only).
 */
import { z } from "zod";
import { DEFAULT_PAGE_SIZE } from "../constants.ts";
import { flattenConnection, shopifyGraphql, toGid } from "../lib/client.ts";
import { MONEY, PAGE_INFO } from "../lib/gql.ts";
import {
  createShopifyTool,
  paginationSchema,
  searchQuerySchema,
} from "../lib/tool.ts";

export const LIST_PRODUCTS_QUERY = `
query ListProducts($first: Int!, $after: String, $query: String, $sortKey: ProductSortKeys, $reverse: Boolean) {
  products(first: $first, after: $after, query: $query, sortKey: $sortKey, reverse: $reverse) {
    ${PAGE_INFO}
    nodes {
      id
      legacyResourceId
      title
      handle
      status
      vendor
      productType
      tags
      createdAt
      updatedAt
      publishedAt
      onlineStoreUrl
      totalInventory
      tracksInventory
      hasOnlyDefaultVariant
      variantsCount { count }
      featuredMedia { preview { image { url altText } } }
      priceRangeV2 { minVariantPrice ${MONEY} maxVariantPrice ${MONEY} }
    }
  }
}`;

export const listProducts = createShopifyTool({
  id: "SHOPIFY_LIST_PRODUCTS",
  description:
    'List products with pagination and Shopify search-syntax filters (e.g. "status:active vendor:Nike tag:sale sku:ABC*").',
  inputSchema: z.object({
    ...paginationSchema,
    query: searchQuerySchema,
    sortKey: z
      .enum([
        "TITLE",
        "PRODUCT_TYPE",
        "VENDOR",
        "INVENTORY_TOTAL",
        "UPDATED_AT",
        "CREATED_AT",
        "PUBLISHED_AT",
        "ID",
        "RELEVANCE",
      ])
      .optional()
      .describe("Sort key (default ID)"),
    reverse: z.boolean().optional().describe("Reverse the sort order"),
  }),
  handler: async (input, creds) => {
    const data = await shopifyGraphql<{ products: unknown }>(
      creds,
      LIST_PRODUCTS_QUERY,
      {
        first: input.first ?? DEFAULT_PAGE_SIZE,
        after: input.after,
        query: input.query,
        sortKey: input.sortKey,
        reverse: input.reverse,
      },
      "SHOPIFY_LIST_PRODUCTS",
    );
    return { products: flattenConnection(data.products) };
  },
});

const PRODUCT_FULL_FRAGMENT = `
fragment ProductFull on Product {
  id
  legacyResourceId
  title
  handle
  status
  vendor
  productType
  tags
  description
  descriptionHtml
  createdAt
  updatedAt
  publishedAt
  onlineStoreUrl
  onlineStorePreviewUrl
  templateSuffix
  isGiftCard
  totalInventory
  tracksInventory
  hasOnlyDefaultVariant
  hasOutOfStockVariants
  category { id name fullName }
  seo { title description }
  priceRangeV2 { minVariantPrice ${MONEY} maxVariantPrice ${MONEY} }
  compareAtPriceRange { minVariantCompareAtPrice ${MONEY} maxVariantCompareAtPrice ${MONEY} }
  featuredMedia { preview { image { url altText } } }
  options { id name position optionValues { id name } }
  variantsCount { count }
  mediaCount { count }
  variants(first: 100) {
    ${PAGE_INFO}
    nodes {
      id
      legacyResourceId
      title
      displayName
      sku
      barcode
      price
      compareAtPrice
      position
      availableForSale
      inventoryQuantity
      inventoryPolicy
      taxable
      createdAt
      updatedAt
      selectedOptions { name value }
      inventoryItem { id }
      media(first: 1) { nodes { preview { image { url altText } } } }
    }
  }
  media(first: 10) { nodes { id mediaContentType preview { image { url altText } } } }
}`;

export const GET_PRODUCT_BY_ID_QUERY = `
${PRODUCT_FULL_FRAGMENT}
query GetProduct($id: ID!) {
  product(id: $id) { ...ProductFull }
}`;

export const GET_PRODUCT_BY_HANDLE_QUERY = `
${PRODUCT_FULL_FRAGMENT}
query GetProductByHandle($handle: String!) {
  productByIdentifier(identifier: { handle: $handle }) { ...ProductFull }
}`;

export const getProduct = createShopifyTool({
  id: "SHOPIFY_GET_PRODUCT",
  description:
    "Fetch one product by ID or handle, including variants, options, media, SEO and price ranges.",
  inputSchema: z
    .object({
      id: z
        .string()
        .optional()
        .describe(
          'Product ID — numeric ("123") or GID ("gid://shopify/Product/123")',
        ),
      handle: z.string().optional().describe("Product handle (URL slug)"),
    })
    .refine((v) => Boolean(v.id || v.handle), {
      message: "Provide either id or handle",
    }),
  handler: async (input, creds) => {
    const data = input.id
      ? await shopifyGraphql<{ product: unknown }>(
          creds,
          GET_PRODUCT_BY_ID_QUERY,
          { id: toGid("Product", input.id) },
          "SHOPIFY_GET_PRODUCT",
        )
      : await shopifyGraphql<{ productByIdentifier: unknown }>(
          creds,
          GET_PRODUCT_BY_HANDLE_QUERY,
          { handle: input.handle },
          "SHOPIFY_GET_PRODUCT",
        );
    const product = "product" in data ? data.product : data.productByIdentifier;
    if (!product) {
      throw new Error(
        `Product not found: ${input.id ?? input.handle}. Check the ID/handle and the token's read_products scope.`,
      );
    }
    return { product };
  },
});

export const LIST_PRODUCT_VARIANTS_QUERY = `
query ListProductVariants($first: Int!, $after: String, $query: String) {
  productVariants(first: $first, after: $after, query: $query) {
    ${PAGE_INFO}
    nodes {
      id
      legacyResourceId
      title
      displayName
      sku
      barcode
      price
      compareAtPrice
      position
      availableForSale
      inventoryQuantity
      createdAt
      updatedAt
      selectedOptions { name value }
      inventoryItem { id }
      product { id title handle status }
    }
  }
}`;

export const listProductVariants = createShopifyTool({
  id: "SHOPIFY_LIST_PRODUCT_VARIANTS",
  description:
    'List/search product variants across the store (price, SKU, barcode, inventory). Supports search syntax like "sku:ABC-123" or "product_id:123".',
  inputSchema: z.object({
    ...paginationSchema,
    query: searchQuerySchema,
  }),
  handler: async (input, creds) => {
    const data = await shopifyGraphql<{ productVariants: unknown }>(
      creds,
      LIST_PRODUCT_VARIANTS_QUERY,
      {
        first: input.first ?? DEFAULT_PAGE_SIZE,
        after: input.after,
        query: input.query,
      },
      "SHOPIFY_LIST_PRODUCT_VARIANTS",
    );
    return { variants: flattenConnection(data.productVariants) };
  },
});

export const LIST_COLLECTIONS_QUERY = `
query ListCollections($first: Int!, $after: String, $query: String, $sortKey: CollectionSortKeys, $reverse: Boolean) {
  collections(first: $first, after: $after, query: $query, sortKey: $sortKey, reverse: $reverse) {
    ${PAGE_INFO}
    nodes {
      id
      legacyResourceId
      title
      handle
      description
      updatedAt
      sortOrder
      templateSuffix
      productsCount { count }
      image { url altText }
    }
  }
}`;

export const listCollections = createShopifyTool({
  id: "SHOPIFY_LIST_COLLECTIONS",
  description:
    "List collections (manual and smart) with pagination and search filters.",
  inputSchema: z.object({
    ...paginationSchema,
    query: searchQuerySchema,
    sortKey: z
      .enum(["TITLE", "UPDATED_AT", "ID", "RELEVANCE"])
      .optional()
      .describe("Sort key (default ID)"),
    reverse: z.boolean().optional().describe("Reverse the sort order"),
  }),
  handler: async (input, creds) => {
    const data = await shopifyGraphql<{ collections: unknown }>(
      creds,
      LIST_COLLECTIONS_QUERY,
      {
        first: input.first ?? DEFAULT_PAGE_SIZE,
        after: input.after,
        query: input.query,
        sortKey: input.sortKey,
        reverse: input.reverse,
      },
      "SHOPIFY_LIST_COLLECTIONS",
    );
    return { collections: flattenConnection(data.collections) };
  },
});

const COLLECTION_FULL_FRAGMENT = `
fragment CollectionFull on Collection {
  id
  legacyResourceId
  title
  handle
  description
  descriptionHtml
  updatedAt
  sortOrder
  templateSuffix
  seo { title description }
  image { url altText }
  productsCount { count }
  products(first: $productsFirst, after: $productsAfter) {
    ${PAGE_INFO}
    nodes {
      id
      title
      handle
      status
      totalInventory
      priceRangeV2 { minVariantPrice ${MONEY} maxVariantPrice ${MONEY} }
    }
  }
}`;

export const GET_COLLECTION_BY_ID_QUERY = `
${COLLECTION_FULL_FRAGMENT}
query GetCollection($id: ID!, $productsFirst: Int!, $productsAfter: String) {
  collection(id: $id) { ...CollectionFull }
}`;

export const GET_COLLECTION_BY_HANDLE_QUERY = `
${COLLECTION_FULL_FRAGMENT}
query GetCollectionByHandle($handle: String!, $productsFirst: Int!, $productsAfter: String) {
  collectionByIdentifier(identifier: { handle: $handle }) { ...CollectionFull }
}`;

export const getCollection = createShopifyTool({
  id: "SHOPIFY_GET_COLLECTION",
  description:
    "Fetch one collection by ID or handle, including a page of its products.",
  inputSchema: z
    .object({
      id: z
        .string()
        .optional()
        .describe(
          'Collection ID — numeric or GID ("gid://shopify/Collection/123")',
        ),
      handle: z.string().optional().describe("Collection handle (URL slug)"),
      productsFirst: z
        .number()
        .int()
        .min(1)
        .max(100)
        .optional()
        .describe("How many products to include (default 20)"),
      productsAfter: z
        .string()
        .optional()
        .describe("Pagination cursor for the products connection"),
    })
    .refine((v) => Boolean(v.id || v.handle), {
      message: "Provide either id or handle",
    }),
  handler: async (input, creds) => {
    const variables = {
      productsFirst: input.productsFirst ?? DEFAULT_PAGE_SIZE,
      productsAfter: input.productsAfter,
    };
    const data = input.id
      ? await shopifyGraphql<{ collection: unknown }>(
          creds,
          GET_COLLECTION_BY_ID_QUERY,
          { ...variables, id: toGid("Collection", input.id) },
          "SHOPIFY_GET_COLLECTION",
        )
      : await shopifyGraphql<{ collectionByIdentifier: unknown }>(
          creds,
          GET_COLLECTION_BY_HANDLE_QUERY,
          { ...variables, handle: input.handle },
          "SHOPIFY_GET_COLLECTION",
        );
    const collection =
      "collection" in data ? data.collection : data.collectionByIdentifier;
    if (!collection) {
      throw new Error(`Collection not found: ${input.id ?? input.handle}`);
    }
    return { collection };
  },
});

export const LIST_PUBLICATIONS_QUERY = `
query ListPublications($first: Int!, $after: String) {
  publications(first: $first, after: $after) {
    ${PAGE_INFO}
    nodes {
      id
      autoPublish
      supportsFuturePublishing
      catalog { id title status }
    }
  }
}`;

export const listPublications = createShopifyTool({
  id: "SHOPIFY_LIST_PUBLICATIONS",
  description:
    "List publications (sales channels / catalogs such as Online Store, POS, custom apps) that products can be published to.",
  inputSchema: z.object({ ...paginationSchema }),
  handler: async (input, creds) => {
    const data = await shopifyGraphql<{ publications: unknown }>(
      creds,
      LIST_PUBLICATIONS_QUERY,
      { first: input.first ?? DEFAULT_PAGE_SIZE, after: input.after },
      "SHOPIFY_LIST_PUBLICATIONS",
    );
    return { publications: flattenConnection(data.publications) };
  },
});

export const productTools = [
  listProducts,
  getProduct,
  listProductVariants,
  listCollections,
  getCollection,
  listPublications,
];
