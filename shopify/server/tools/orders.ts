/**
 * Orders tools (read-only): orders, draft orders, abandoned checkouts,
 * refund previews and returns.
 */
import { z } from "zod";
import { DEFAULT_PAGE_SIZE } from "../constants.ts";
import { flattenConnection, shopifyGraphql, toGid } from "../lib/client.ts";
import { ADDRESS, MONEY_BAG, PAGE_INFO } from "../lib/gql.ts";
import {
  createShopifyTool,
  paginationSchema,
  searchQuerySchema,
} from "../lib/tool.ts";

const ORDER_SUMMARY = `
  id
  legacyResourceId
  name
  confirmationNumber
  createdAt
  processedAt
  updatedAt
  closed
  cancelledAt
  cancelReason
  test
  sourceName
  displayFinancialStatus
  displayFulfillmentStatus
  returnStatus
  email
  phone
  note
  tags
  currencyCode
  subtotalLineItemsQuantity
  customer { id displayName }
  totalPriceSet ${MONEY_BAG}
  subtotalPriceSet ${MONEY_BAG}
  totalShippingPriceSet ${MONEY_BAG}
  totalTaxSet ${MONEY_BAG}
  totalRefundedSet ${MONEY_BAG}
  totalOutstandingSet ${MONEY_BAG}
`;

export const LIST_ORDERS_QUERY = `
query ListOrders($first: Int!, $after: String, $query: String, $sortKey: OrderSortKeys, $reverse: Boolean) {
  orders(first: $first, after: $after, query: $query, sortKey: $sortKey, reverse: $reverse) {
    ${PAGE_INFO}
    nodes {
      ${ORDER_SUMMARY}
    }
  }
}`;

export const listOrders = createShopifyTool({
  id: "SHOPIFY_LIST_ORDERS",
  description:
    'List orders with pagination and search filters (e.g. "financial_status:paid fulfillment_status:unfulfilled created_at:>=2026-01-01"). Note: tokens see the last 60 days unless they have the read_all_orders scope.',
  inputSchema: z.object({
    ...paginationSchema,
    query: searchQuerySchema,
    sortKey: z
      .enum([
        "CREATED_AT",
        "UPDATED_AT",
        "PROCESSED_AT",
        "ORDER_NUMBER",
        "TOTAL_PRICE",
        "CUSTOMER_NAME",
        "FINANCIAL_STATUS",
        "FULFILLMENT_STATUS",
        "DESTINATION",
        "ID",
        "RELEVANCE",
      ])
      .optional()
      .describe("Sort key (default PROCESSED_AT)"),
    reverse: z.boolean().optional().describe("Reverse the sort order"),
  }),
  handler: async (input, creds) => {
    const data = await shopifyGraphql<{ orders: unknown }>(
      creds,
      LIST_ORDERS_QUERY,
      {
        first: input.first ?? DEFAULT_PAGE_SIZE,
        after: input.after,
        query: input.query,
        sortKey: input.sortKey,
        reverse: input.reverse,
      },
      "SHOPIFY_LIST_ORDERS",
    );
    return { orders: flattenConnection(data.orders) };
  },
});

export const GET_ORDER_QUERY = `
query GetOrder($id: ID!) {
  order(id: $id) {
    ${ORDER_SUMMARY}
    statusPageUrl
    paymentGatewayNames
    customAttributes { key value }
    shippingAddress ${ADDRESS}
    billingAddress ${ADDRESS}
    customer { id displayName defaultEmailAddress { emailAddress } defaultPhoneNumber { phoneNumber } }
    lineItems(first: 100) {
      ${PAGE_INFO}
      nodes {
        id
        title
        name
        quantity
        currentQuantity
        unfulfilledQuantity
        sku
        vendor
        variantTitle
        requiresShipping
        variant { id }
        product { id }
        originalUnitPriceSet ${MONEY_BAG}
        discountedTotalSet ${MONEY_BAG}
        totalDiscountSet ${MONEY_BAG}
      }
    }
    transactions {
      id
      kind
      status
      gateway
      processedAt
      test
      errorCode
      amountSet ${MONEY_BAG}
    }
    fulfillments(first: 50) {
      id
      name
      status
      displayStatus
      createdAt
      deliveredAt
      estimatedDeliveryAt
      totalQuantity
      trackingInfo(first: 10) { number company url }
    }
    refunds {
      id
      note
      createdAt
      totalRefundedSet ${MONEY_BAG}
    }
    returns(first: 10) {
      nodes { id name status totalQuantity }
    }
  }
}`;

export const getOrder = createShopifyTool({
  id: "SHOPIFY_GET_ORDER",
  description:
    "Fetch one order by ID with line items, addresses, transactions, fulfillments, refunds and returns.",
  inputSchema: z.object({
    id: z
      .string()
      .describe(
        'Order ID — numeric ("123") or GID ("gid://shopify/Order/123")',
      ),
  }),
  handler: async (input, creds) => {
    const data = await shopifyGraphql<{ order: unknown }>(
      creds,
      GET_ORDER_QUERY,
      { id: toGid("Order", input.id) },
      "SHOPIFY_GET_ORDER",
    );
    if (!data.order) {
      throw new Error(
        `Order not found: ${input.id}. Orders older than 60 days require the read_all_orders scope.`,
      );
    }
    return { order: data.order };
  },
});

const DRAFT_ORDER_SUMMARY = `
  id
  legacyResourceId
  name
  status
  createdAt
  updatedAt
  completedAt
  invoiceUrl
  invoiceSentAt
  tags
  note2
  email
  phone
  taxExempt
  currencyCode
  totalQuantityOfLineItems
  customer { id displayName }
  totalPriceSet ${MONEY_BAG}
  subtotalPriceSet ${MONEY_BAG}
  totalTaxSet ${MONEY_BAG}
`;

export const LIST_DRAFT_ORDERS_QUERY = `
query ListDraftOrders($first: Int!, $after: String, $query: String) {
  draftOrders(first: $first, after: $after, query: $query) {
    ${PAGE_INFO}
    nodes {
      ${DRAFT_ORDER_SUMMARY}
    }
  }
}`;

export const listDraftOrders = createShopifyTool({
  id: "SHOPIFY_LIST_DRAFT_ORDERS",
  description:
    'List draft orders with pagination and search filters (e.g. "status:open").',
  inputSchema: z.object({
    ...paginationSchema,
    query: searchQuerySchema,
  }),
  handler: async (input, creds) => {
    const data = await shopifyGraphql<{ draftOrders: unknown }>(
      creds,
      LIST_DRAFT_ORDERS_QUERY,
      {
        first: input.first ?? DEFAULT_PAGE_SIZE,
        after: input.after,
        query: input.query,
      },
      "SHOPIFY_LIST_DRAFT_ORDERS",
    );
    return { draftOrders: flattenConnection(data.draftOrders) };
  },
});

export const GET_DRAFT_ORDER_QUERY = `
query GetDraftOrder($id: ID!) {
  draftOrder(id: $id) {
    ${DRAFT_ORDER_SUMMARY}
    shippingAddress ${ADDRESS}
    billingAddress ${ADDRESS}
    shippingLine { title }
    appliedDiscount { title description value valueType amountSet ${MONEY_BAG} }
    order { id name }
    lineItems(first: 100) {
      ${PAGE_INFO}
      nodes {
        id
        title
        name
        quantity
        sku
        vendor
        custom
        variant { id title }
        product { id title }
        originalUnitPriceSet ${MONEY_BAG}
        totalDiscountSet ${MONEY_BAG}
      }
    }
  }
}`;

export const getDraftOrder = createShopifyTool({
  id: "SHOPIFY_GET_DRAFT_ORDER",
  description:
    "Fetch one draft order by ID with line items, addresses, discounts and the completed order reference.",
  inputSchema: z.object({
    id: z
      .string()
      .describe(
        'Draft order ID — numeric or GID ("gid://shopify/DraftOrder/123")',
      ),
  }),
  handler: async (input, creds) => {
    const data = await shopifyGraphql<{ draftOrder: unknown }>(
      creds,
      GET_DRAFT_ORDER_QUERY,
      { id: toGid("DraftOrder", input.id) },
      "SHOPIFY_GET_DRAFT_ORDER",
    );
    if (!data.draftOrder) {
      throw new Error(`Draft order not found: ${input.id}`);
    }
    return { draftOrder: data.draftOrder };
  },
});

export const LIST_ABANDONED_CHECKOUTS_QUERY = `
query ListAbandonedCheckouts($first: Int!, $after: String, $query: String) {
  abandonedCheckouts(first: $first, after: $after, query: $query) {
    ${PAGE_INFO}
    nodes {
      id
      name
      abandonedCheckoutUrl
      createdAt
      updatedAt
      completedAt
      note
      discountCodes
      taxesIncluded
      totalPriceSet ${MONEY_BAG}
      subtotalPriceSet ${MONEY_BAG}
      customer { id displayName }
      lineItems(first: 20) { nodes { title quantity } }
    }
  }
}`;

export const listAbandonedCheckouts = createShopifyTool({
  id: "SHOPIFY_LIST_ABANDONED_CHECKOUTS",
  description:
    "List abandoned checkouts (carts that reached checkout but were not completed), with recovery URLs.",
  inputSchema: z.object({
    ...paginationSchema,
    query: searchQuerySchema,
  }),
  handler: async (input, creds) => {
    const data = await shopifyGraphql<{ abandonedCheckouts: unknown }>(
      creds,
      LIST_ABANDONED_CHECKOUTS_QUERY,
      {
        first: input.first ?? DEFAULT_PAGE_SIZE,
        after: input.after,
        query: input.query,
      },
      "SHOPIFY_LIST_ABANDONED_CHECKOUTS",
    );
    return { abandonedCheckouts: flattenConnection(data.abandonedCheckouts) };
  },
});

export const CALCULATE_REFUND_QUERY = `
query CalculateRefund($orderId: ID!, $refundLineItems: [RefundLineItemInput!], $suggestFullRefund: Boolean) {
  order(id: $orderId) {
    id
    name
    suggestedRefund(refundLineItems: $refundLineItems, suggestFullRefund: $suggestFullRefund) {
      amountSet ${MONEY_BAG}
      maximumRefundableSet ${MONEY_BAG}
      subtotalSet ${MONEY_BAG}
      totalTaxSet ${MONEY_BAG}
      shipping { amountSet ${MONEY_BAG} maximumRefundableSet ${MONEY_BAG} }
      refundLineItems {
        quantity
        lineItem { id title sku }
        priceSet ${MONEY_BAG}
        subtotalSet ${MONEY_BAG}
      }
      suggestedTransactions {
        gateway
        amountSet ${MONEY_BAG}
        parentTransaction { id kind gateway }
      }
    }
  }
}`;

export const calculateRefund = createShopifyTool({
  id: "SHOPIFY_CALCULATE_REFUND",
  description:
    "Preview what a refund would amount to for an order (pure calculation — changes nothing). Pass line items to refund, or suggestFullRefund for the whole order.",
  inputSchema: z.object({
    orderId: z
      .string()
      .describe('Order ID — numeric or GID ("gid://shopify/Order/123")'),
    suggestFullRefund: z
      .boolean()
      .optional()
      .describe("Calculate a full refund of the remaining amount"),
    refundLineItems: z
      .array(
        z.object({
          lineItemId: z
            .string()
            .describe(
              'Line item ID — numeric or GID ("gid://shopify/LineItem/123")',
            ),
          quantity: z.number().int().min(1).describe("Quantity to refund"),
        }),
      )
      .optional()
      .describe("Specific line items to include in the refund preview"),
  }),
  handler: async (input, creds) => {
    const data = await shopifyGraphql<{
      order: { suggestedRefund?: unknown } | null;
    }>(
      creds,
      CALCULATE_REFUND_QUERY,
      {
        orderId: toGid("Order", input.orderId),
        suggestFullRefund: input.suggestFullRefund,
        refundLineItems: input.refundLineItems?.map((item) => ({
          lineItemId: toGid("LineItem", item.lineItemId),
          quantity: item.quantity,
        })),
      },
      "SHOPIFY_CALCULATE_REFUND",
    );
    if (!data.order) {
      throw new Error(`Order not found: ${input.orderId}`);
    }
    return { suggestedRefund: data.order.suggestedRefund ?? null };
  },
});

export const LIST_RETURNS_QUERY = `
query ListReturns($orderId: ID!, $first: Int!) {
  order(id: $orderId) {
    id
    name
    returnStatus
    returns(first: $first) {
      ${PAGE_INFO}
      nodes {
        id
        name
        status
        totalQuantity
        createdAt
        closedAt
        requestApprovedAt
        returnLineItems(first: 50) {
          nodes {
            ... on ReturnLineItem {
              id
              quantity
              processedQuantity
              refundedQuantity
              returnReasonNote
              customerNote
            }
          }
        }
      }
    }
  }
  returnableFulfillments(orderId: $orderId, first: 10) {
    nodes {
      id
      fulfillment { id name status }
      returnableFulfillmentLineItems(first: 50) {
        nodes {
          quantity
          fulfillmentLineItem { id lineItem { title sku } }
        }
      }
    }
  }
}`;

export const listReturns = createShopifyTool({
  id: "SHOPIFY_LIST_RETURNS",
  description:
    "List returns on an order plus what is still returnable (fulfilled items eligible for return).",
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
      .describe("How many returns to fetch (default 10)"),
  }),
  handler: async (input, creds) => {
    const data = await shopifyGraphql<{
      order: { returns?: unknown } | null;
      returnableFulfillments: unknown;
    }>(
      creds,
      LIST_RETURNS_QUERY,
      { orderId: toGid("Order", input.orderId), first: input.first ?? 10 },
      "SHOPIFY_LIST_RETURNS",
    );
    if (!data.order) {
      throw new Error(`Order not found: ${input.orderId}`);
    }
    return {
      order: data.order,
      returnableFulfillments: flattenConnection(data.returnableFulfillments),
    };
  },
});

export const orderTools = [
  listOrders,
  getOrder,
  listDraftOrders,
  getDraftOrder,
  listAbandonedCheckouts,
  calculateRefund,
  listReturns,
];
