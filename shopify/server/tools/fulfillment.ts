/**
 * Fulfillment & shipping tools (read-only): fulfillment orders, locations,
 * carrier services.
 */
import { z } from "zod";
import { DEFAULT_PAGE_SIZE } from "../constants.ts";
import { flattenConnection, shopifyGraphql, toGid } from "../lib/client.ts";
import { PAGE_INFO } from "../lib/gql.ts";
import {
  createShopifyTool,
  paginationSchema,
  searchQuerySchema,
} from "../lib/tool.ts";

export const LIST_FULFILLMENT_ORDERS_QUERY = `
query ListFulfillmentOrders($orderId: ID!, $first: Int!) {
  order(id: $orderId) {
    id
    name
    displayFulfillmentStatus
    fulfillmentOrders(first: $first) {
      ${PAGE_INFO}
      nodes {
        id
        status
        requestStatus
        createdAt
        updatedAt
        fulfillAt
        fulfillBy
        orderName
        assignedLocation { name address1 city zip countryCode phone location { id name } }
        deliveryMethod { methodType }
        destination { firstName lastName company address1 address2 city province zip countryCode email phone }
        lineItems(first: 50) {
          nodes {
            id
            sku
            productTitle
            variantTitle
            remainingQuantity
            totalQuantity
          }
        }
        fulfillmentHolds { reason reasonNotes }
        supportedActions { action externalUrl }
      }
    }
  }
}`;

export const listFulfillmentOrders = createShopifyTool({
  id: "SHOPIFY_LIST_FULFILLMENT_ORDERS",
  description:
    "List fulfillment orders for an order — the units of fulfillment work with assigned location, line items, holds and supported actions.",
  inputSchema: z.object({
    orderId: z
      .string()
      .describe('Order ID — numeric or GID ("gid://shopify/Order/123")'),
    first: z
      .number()
      .int()
      .min(1)
      .max(50)
      .optional()
      .describe("How many fulfillment orders to fetch (default 20)"),
  }),
  handler: async (input, creds) => {
    const data = await shopifyGraphql<{ order: unknown }>(
      creds,
      LIST_FULFILLMENT_ORDERS_QUERY,
      {
        orderId: toGid("Order", input.orderId),
        first: input.first ?? DEFAULT_PAGE_SIZE,
      },
      "SHOPIFY_LIST_FULFILLMENT_ORDERS",
    );
    if (!data.order) {
      throw new Error(`Order not found: ${input.orderId}`);
    }
    return { order: data.order };
  },
});

export const LIST_LOCATIONS_QUERY = `
query ListLocations($first: Int!, $after: String, $query: String, $includeInactive: Boolean) {
  locations(first: $first, after: $after, query: $query, includeInactive: $includeInactive) {
    ${PAGE_INFO}
    nodes {
      id
      name
      isActive
      fulfillsOnlineOrders
      shipsInventory
      hasActiveInventory
      address { address1 address2 city province provinceCode zip country countryCode phone }
    }
  }
}`;

export const listLocations = createShopifyTool({
  id: "SHOPIFY_LIST_LOCATIONS",
  description:
    "List store locations (needed to interpret inventory levels and fulfillment assignments).",
  inputSchema: z.object({
    ...paginationSchema,
    query: searchQuerySchema,
    includeInactive: z
      .boolean()
      .optional()
      .describe("Include deactivated locations"),
  }),
  handler: async (input, creds) => {
    const data = await shopifyGraphql<{ locations: unknown }>(
      creds,
      LIST_LOCATIONS_QUERY,
      {
        first: input.first ?? DEFAULT_PAGE_SIZE,
        after: input.after,
        query: input.query,
        includeInactive: input.includeInactive,
      },
      "SHOPIFY_LIST_LOCATIONS",
    );
    return { locations: flattenConnection(data.locations) };
  },
});

export const LIST_CARRIER_SERVICES_QUERY = `
query ListCarrierServices($first: Int!, $after: String) {
  carrierServices(first: $first, after: $after) {
    ${PAGE_INFO}
    nodes {
      id
      name
      active
      callbackUrl
      formattedName
      supportsServiceDiscovery
    }
  }
}`;

export const listCarrierServices = createShopifyTool({
  id: "SHOPIFY_LIST_CARRIER_SERVICES",
  description:
    "List registered carrier services (external shipping-rate providers).",
  inputSchema: z.object({ ...paginationSchema }),
  handler: async (input, creds) => {
    const data = await shopifyGraphql<{ carrierServices: unknown }>(
      creds,
      LIST_CARRIER_SERVICES_QUERY,
      { first: input.first ?? DEFAULT_PAGE_SIZE, after: input.after },
      "SHOPIFY_LIST_CARRIER_SERVICES",
    );
    return { carrierServices: flattenConnection(data.carrierServices) };
  },
});

export const fulfillmentTools = [
  listFulfillmentOrders,
  listLocations,
  listCarrierServices,
];
