/**
 * Customers tools (read-only): customers, their orders and segments.
 */
import { z } from "zod";
import { DEFAULT_PAGE_SIZE } from "../constants.ts";
import { flattenConnection, shopifyGraphql, toGid } from "../lib/client.ts";
import { ADDRESS, MONEY, MONEY_BAG, PAGE_INFO } from "../lib/gql.ts";
import {
  createShopifyTool,
  paginationSchema,
  searchQuerySchema,
} from "../lib/tool.ts";

const CUSTOMER_SUMMARY = `
  id
  legacyResourceId
  displayName
  firstName
  lastName
  state
  note
  verifiedEmail
  createdAt
  updatedAt
  tags
  numberOfOrders
  amountSpent ${MONEY}
  defaultEmailAddress { emailAddress marketingState }
  defaultPhoneNumber { phoneNumber marketingState }
  defaultAddress { city province country }
`;

export const LIST_CUSTOMERS_QUERY = `
query ListCustomers($first: Int!, $after: String, $query: String, $sortKey: CustomerSortKeys, $reverse: Boolean) {
  customers(first: $first, after: $after, query: $query, sortKey: $sortKey, reverse: $reverse) {
    ${PAGE_INFO}
    nodes {
      ${CUSTOMER_SUMMARY}
    }
  }
}`;

export const listCustomers = createShopifyTool({
  id: "SHOPIFY_LIST_CUSTOMERS",
  description:
    'Search customers with pagination and filters (e.g. "email:jane@example.com", "orders_count:>5 customer_date:>=2026-01-01", "tag:vip").',
  inputSchema: z.object({
    ...paginationSchema,
    query: searchQuerySchema,
    sortKey: z
      .enum(["CREATED_AT", "UPDATED_AT", "NAME", "LOCATION", "ID", "RELEVANCE"])
      .optional()
      .describe("Sort key (default ID)"),
    reverse: z.boolean().optional().describe("Reverse the sort order"),
  }),
  handler: async (input, creds) => {
    const data = await shopifyGraphql<{ customers: unknown }>(
      creds,
      LIST_CUSTOMERS_QUERY,
      {
        first: input.first ?? DEFAULT_PAGE_SIZE,
        after: input.after,
        query: input.query,
        sortKey: input.sortKey,
        reverse: input.reverse,
      },
      "SHOPIFY_LIST_CUSTOMERS",
    );
    return { customers: flattenConnection(data.customers) };
  },
});

export const GET_CUSTOMER_QUERY = `
query GetCustomer($id: ID!) {
  customer(id: $id) {
    ${CUSTOMER_SUMMARY}
    locale
    lifetimeDuration
    taxExempt
    taxExemptions
    canDelete
    defaultAddress ${ADDRESS}
    addressesV2(first: 10) { nodes ${ADDRESS} }
    lastOrder { id name createdAt }
    companyContactProfiles { company { id name } }
  }
}`;

export const getCustomer = createShopifyTool({
  id: "SHOPIFY_GET_CUSTOMER",
  description:
    "Fetch one customer by ID: profile, marketing consent, addresses, lifetime spend and B2B company links.",
  inputSchema: z.object({
    id: z
      .string()
      .describe('Customer ID — numeric or GID ("gid://shopify/Customer/123")'),
  }),
  handler: async (input, creds) => {
    const data = await shopifyGraphql<{ customer: unknown }>(
      creds,
      GET_CUSTOMER_QUERY,
      { id: toGid("Customer", input.id) },
      "SHOPIFY_GET_CUSTOMER",
    );
    if (!data.customer) {
      throw new Error(`Customer not found: ${input.id}`);
    }
    return { customer: data.customer };
  },
});

export const GET_CUSTOMER_ORDERS_QUERY = `
query GetCustomerOrders($id: ID!, $first: Int!, $after: String) {
  customer(id: $id) {
    id
    displayName
    numberOfOrders
    orders(first: $first, after: $after, sortKey: CREATED_AT, reverse: true) {
      ${PAGE_INFO}
      nodes {
        id
        name
        createdAt
        displayFinancialStatus
        displayFulfillmentStatus
        totalPriceSet ${MONEY_BAG}
      }
    }
  }
}`;

export const getCustomerOrders = createShopifyTool({
  id: "SHOPIFY_GET_CUSTOMER_ORDERS",
  description: "List orders for one customer, most recent first.",
  inputSchema: z.object({
    id: z
      .string()
      .describe('Customer ID — numeric or GID ("gid://shopify/Customer/123")'),
    ...paginationSchema,
  }),
  handler: async (input, creds) => {
    const data = await shopifyGraphql<{ customer: unknown }>(
      creds,
      GET_CUSTOMER_ORDERS_QUERY,
      {
        id: toGid("Customer", input.id),
        first: input.first ?? DEFAULT_PAGE_SIZE,
        after: input.after,
      },
      "SHOPIFY_GET_CUSTOMER_ORDERS",
    );
    if (!data.customer) {
      throw new Error(`Customer not found: ${input.id}`);
    }
    return { customer: data.customer };
  },
});

export const LIST_SEGMENTS_QUERY = `
query ListSegments($first: Int!, $after: String, $query: String) {
  segments(first: $first, after: $after, query: $query) {
    ${PAGE_INFO}
    nodes {
      id
      name
      query
      creationDate
      lastEditDate
    }
  }
}`;

export const listSegments = createShopifyTool({
  id: "SHOPIFY_LIST_SEGMENTS",
  description: "List customer segments and their definition queries.",
  inputSchema: z.object({
    ...paginationSchema,
    query: searchQuerySchema,
  }),
  handler: async (input, creds) => {
    const data = await shopifyGraphql<{ segments: unknown }>(
      creds,
      LIST_SEGMENTS_QUERY,
      {
        first: input.first ?? DEFAULT_PAGE_SIZE,
        after: input.after,
        query: input.query,
      },
      "SHOPIFY_LIST_SEGMENTS",
    );
    return { segments: flattenConnection(data.segments) };
  },
});

export const LIST_SEGMENT_MEMBERS_QUERY = `
query ListSegmentMembers($segmentId: ID!, $first: Int!, $after: String) {
  customerSegmentMembers(segmentId: $segmentId, first: $first, after: $after) {
    ${PAGE_INFO}
    edges {
      node {
        id
        displayName
        numberOfOrders
        lastOrderId
        amountSpent ${MONEY}
        defaultEmailAddress { emailAddress }
      }
    }
  }
}`;

export const listSegmentMembers = createShopifyTool({
  id: "SHOPIFY_LIST_SEGMENT_MEMBERS",
  description: "List the customers that belong to a segment.",
  inputSchema: z.object({
    segmentId: z
      .string()
      .describe('Segment ID — numeric or GID ("gid://shopify/Segment/123")'),
    ...paginationSchema,
  }),
  handler: async (input, creds) => {
    const data = await shopifyGraphql<{ customerSegmentMembers: unknown }>(
      creds,
      LIST_SEGMENT_MEMBERS_QUERY,
      {
        segmentId: toGid("Segment", input.segmentId),
        first: input.first ?? DEFAULT_PAGE_SIZE,
        after: input.after,
      },
      "SHOPIFY_LIST_SEGMENT_MEMBERS",
    );
    return { members: flattenConnection(data.customerSegmentMembers) };
  },
});

export const customerTools = [
  listCustomers,
  getCustomer,
  getCustomerOrders,
  listSegments,
  listSegmentMembers,
];
