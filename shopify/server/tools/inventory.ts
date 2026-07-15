/**
 * Inventory tools (read-only): levels per item x location and item details.
 */
import { z } from "zod";
import { shopifyGraphql, toGid } from "../lib/client.ts";
import { MONEY, PAGE_INFO } from "../lib/gql.ts";
import { createShopifyTool } from "../lib/tool.ts";

const DEFAULT_QUANTITY_NAMES = [
  "available",
  "committed",
  "incoming",
  "on_hand",
  "reserved",
];

const quantityNamesSchema = z
  .array(z.string())
  .optional()
  .describe(
    'Quantity states to return (default ["available","committed","incoming","on_hand","reserved"]; also "damaged", "quality_control", "safety_stock")',
  );

export const INVENTORY_LEVELS_BY_ITEM_QUERY = `
query InventoryLevelsByItem($itemId: ID!, $first: Int!, $names: [String!]!) {
  inventoryItem(id: $itemId) {
    id
    sku
    tracked
    inventoryLevels(first: $first) {
      ${PAGE_INFO}
      nodes {
        id
        updatedAt
        location { id name }
        quantities(names: $names) { name quantity }
      }
    }
  }
}`;

export const INVENTORY_LEVELS_BY_VARIANT_QUERY = `
query InventoryLevelsByVariant($variantId: ID!, $first: Int!, $names: [String!]!) {
  productVariant(id: $variantId) {
    id
    displayName
    sku
    inventoryItem {
      id
      sku
      tracked
      inventoryLevels(first: $first) {
        ${PAGE_INFO}
        nodes {
          id
          updatedAt
          location { id name }
          quantities(names: $names) { name quantity }
        }
      }
    }
  }
}`;

export const INVENTORY_LEVELS_BY_LOCATION_QUERY = `
query InventoryLevelsByLocation($locationId: ID!, $first: Int!, $after: String, $query: String, $names: [String!]!) {
  location(id: $locationId) {
    id
    name
    inventoryLevels(first: $first, after: $after, query: $query) {
      ${PAGE_INFO}
      nodes {
        id
        updatedAt
        item { id sku variant { id displayName } }
        quantities(names: $names) { name quantity }
      }
    }
  }
}`;

export const getInventoryLevels = createShopifyTool({
  id: "SHOPIFY_GET_INVENTORY_LEVELS",
  description:
    "Get inventory quantities (available, on-hand, committed, incoming, reserved) per location. Provide exactly one of inventoryItemId, productVariantId or locationId.",
  inputSchema: z
    .object({
      inventoryItemId: z
        .string()
        .optional()
        .describe(
          'Inventory item ID — numeric or GID ("gid://shopify/InventoryItem/123")',
        ),
      productVariantId: z
        .string()
        .optional()
        .describe(
          'Product variant ID — numeric or GID ("gid://shopify/ProductVariant/123")',
        ),
      locationId: z
        .string()
        .optional()
        .describe(
          'Location ID — numeric or GID ("gid://shopify/Location/123")',
        ),
      first: z
        .number()
        .int()
        .min(1)
        .max(100)
        .optional()
        .describe("Results per page (default 50)"),
      after: z
        .string()
        .optional()
        .describe("Pagination cursor (only for locationId lookups)"),
      query: z
        .string()
        .optional()
        .describe(
          'Filter for location inventory, e.g. "sku:ABC-123" (only for locationId lookups)',
        ),
      quantityNames: quantityNamesSchema,
    })
    .refine(
      (v) =>
        [v.inventoryItemId, v.productVariantId, v.locationId].filter(Boolean)
          .length === 1,
      {
        message:
          "Provide exactly one of inventoryItemId, productVariantId or locationId",
      },
    ),
  handler: async (input, creds) => {
    const names = input.quantityNames?.length
      ? input.quantityNames
      : DEFAULT_QUANTITY_NAMES;
    const first = input.first ?? 50;

    if (input.inventoryItemId) {
      const data = await shopifyGraphql<{ inventoryItem: unknown }>(
        creds,
        INVENTORY_LEVELS_BY_ITEM_QUERY,
        {
          itemId: toGid("InventoryItem", input.inventoryItemId),
          first,
          names,
        },
        "SHOPIFY_GET_INVENTORY_LEVELS",
      );
      if (!data.inventoryItem) {
        throw new Error(`Inventory item not found: ${input.inventoryItemId}`);
      }
      return { inventoryItem: data.inventoryItem };
    }

    if (input.productVariantId) {
      const data = await shopifyGraphql<{ productVariant: unknown }>(
        creds,
        INVENTORY_LEVELS_BY_VARIANT_QUERY,
        {
          variantId: toGid("ProductVariant", input.productVariantId),
          first,
          names,
        },
        "SHOPIFY_GET_INVENTORY_LEVELS",
      );
      if (!data.productVariant) {
        throw new Error(`Product variant not found: ${input.productVariantId}`);
      }
      return { productVariant: data.productVariant };
    }

    const data = await shopifyGraphql<{ location: unknown }>(
      creds,
      INVENTORY_LEVELS_BY_LOCATION_QUERY,
      {
        locationId: toGid("Location", input.locationId as string),
        first,
        after: input.after,
        query: input.query,
        names,
      },
      "SHOPIFY_GET_INVENTORY_LEVELS",
    );
    if (!data.location) {
      throw new Error(`Location not found: ${input.locationId}`);
    }
    return { location: data.location };
  },
});

export const GET_INVENTORY_ITEM_QUERY = `
query GetInventoryItem($id: ID!) {
  inventoryItem(id: $id) {
    id
    legacyResourceId
    sku
    tracked
    requiresShipping
    countryCodeOfOrigin
    provinceCodeOfOrigin
    harmonizedSystemCode
    createdAt
    updatedAt
    unitCost ${MONEY}
    measurement { weight { value unit } }
    locationsCount { count }
    variants(first: 5) { nodes { id displayName product { id title } } }
  }
}`;

export const getInventoryItem = createShopifyTool({
  id: "SHOPIFY_GET_INVENTORY_ITEM",
  description:
    "Get inventory item details: unit cost, tracked flag, country of origin, HS code, weight and linked variants.",
  inputSchema: z.object({
    id: z
      .string()
      .describe(
        'Inventory item ID — numeric or GID ("gid://shopify/InventoryItem/123")',
      ),
  }),
  handler: async (input, creds) => {
    const data = await shopifyGraphql<{ inventoryItem: unknown }>(
      creds,
      GET_INVENTORY_ITEM_QUERY,
      { id: toGid("InventoryItem", input.id) },
      "SHOPIFY_GET_INVENTORY_ITEM",
    );
    if (!data.inventoryItem) {
      throw new Error(`Inventory item not found: ${input.id}`);
    }
    return { inventoryItem: data.inventoryItem };
  },
});

export const inventoryTools = [getInventoryLevels, getInventoryItem];
