import { createTool } from "@decocms/runtime/tools";
import { z } from "zod";
import { VTEXClient, getCredentials } from "../../lib/client.ts";
import type { Env } from "../../types/env.ts";

export const listOrders = (env: Env) =>
  createTool({
    id: "VTEX_LIST_ORDERS",
    description:
      "List VTEX orders with detailed information including status, payment, shipping, and customer details",
    inputSchema: z.object({
      page: z
        .number()
        .optional()
        .describe("Page number (1-30). The limit of retrieval is 30 pages."),
      perPage: z
        .number()
        .optional()
        .describe("Items per page (default: 15, max: 100)"),
      orderBy: z
        .string()
        .optional()
        .describe(
          "Order field and type concatenated: {{OrderField}},{{OrderType}}. OrderField: creationDate, orderId, items, totalValue, origin. OrderType: asc, desc. Example: creationDate,desc",
        ),
      q: z
        .string()
        .optional()
        .describe(
          "Fulltext search. Accepts: Order ID, Client email, Client document, Client name. Note: '+' character is not allowed.",
        ),
      status: z
        .string()
        .optional()
        .describe(
          "Filter by status: waiting-for-sellers-confirmation, payment-pending, payment-approved, ready-for-handling, handling, invoiced, canceled",
        ),
      creationDate: z
        .string()
        .optional()
        .describe(
          "Filter by creation date range in Timestamp format. Example: creationDate:[2024-01-01T00:00:00.000Z TO 2024-01-31T23:59:59.999Z]",
        ),
      authorizedDate: z
        .string()
        .optional()
        .describe(
          "Filter by authorized date range. Example: authorizedDate:[2024-01-01T00:00:00.000Z TO 2024-01-31T23:59:59.999Z]",
        ),
      invoicedDate: z
        .string()
        .optional()
        .describe(
          "Filter by invoiced date range. Example: invoicedDate:[2024-01-01T00:00:00.000Z TO 2024-01-31T23:59:59.999Z]",
        ),
      hasInputInvoice: z
        .boolean()
        .optional()
        .describe("Filter orders with non-null invoiceInput field"),
      shippingEstimate: z
        .string()
        .optional()
        .describe(
          "Filter by shipping estimate in days. Examples: 0.days (today), 1.days (tomorrow), -1.days (late), 7.days (next 7 days)",
        ),
      utmSource: z
        .string()
        .optional()
        .describe("Filter by UTM source. Example: christmas_campaign"),
      sellerNames: z
        .string()
        .optional()
        .describe("Filter by seller name. Example: SellerName"),
      callCenterOperatorName: z
        .string()
        .optional()
        .describe("Filter by Call Center Operator. Example: Operator%20Name"),
      salesChannel: z
        .string()
        .optional()
        .describe("Filter by sales channel (trade policy) name. Example: Main"),
      salesChannelId: z
        .string()
        .optional()
        .describe("Filter by sales channel (trade policy) ID. Example: 1"),
      affiliateId: z
        .string()
        .optional()
        .describe("Filter by affiliate ID. Example: WLM"),
      paymentNames: z
        .string()
        .optional()
        .describe("Filter by payment type. Example: Visa"),
      rnb: z
        .string()
        .optional()
        .describe(
          "Filter by rates and benefits (promotions). Example: Free+Shipping",
        ),
      isInstore: z
        .boolean()
        .optional()
        .describe("Filter orders made via inStore (true) or not (false)"),
      incompleteOrders: z
        .boolean()
        .optional()
        .describe(
          "When true, retrieve incomplete orders. When false, retrieve complete orders only.",
        ),
      searchField: z
        .string()
        .optional()
        .describe(
          "Search by specific field: SKU ID, Gift List ID, Transaction ID (TID), PCI TID, Payment ID (PID), Connector's NSU",
        ),
    }),
    outputSchema: z.object({
      list: z.array(
        z.object({
          orderId: z.string().describe("Unique order identifier"),
          creationDate: z
            .string()
            .describe("Order creation date in ISO format"),
          clientName: z.string().nullable().describe("Customer name"),
          items: z.array(z.any()).nullable().describe("Order items list"),
          totalValue: z.number().describe("Total order value in cents"),
          paymentNames: z.string().describe("Payment method names"),
          status: z.string().describe("Current order status code"),
          statusDescription: z.string().describe("Human-readable order status"),
          marketPlaceOrderId: z
            .string()
            .nullable()
            .describe("Marketplace order ID if applicable"),
          sequence: z.string().describe("Order sequence number"),
          salesChannel: z.string().describe("Sales channel ID"),
          affiliateId: z.string().describe("Affiliate ID"),
          origin: z
            .string()
            .describe("Order origin (Marketplace, Fulfillment, etc)"),
          workflowInErrorState: z
            .boolean()
            .describe("Whether workflow has errors"),
          workflowInRetry: z.boolean().describe("Whether workflow is retrying"),
          lastMessageUnread: z
            .string()
            .nullable()
            .describe("Last unread message"),
          ShippingEstimatedDate: z
            .string()
            .nullable()
            .describe("Estimated shipping date"),
          ShippingEstimatedDateMax: z
            .string()
            .nullable()
            .describe("Maximum estimated shipping date"),
          ShippingEstimatedDateMin: z
            .string()
            .nullable()
            .describe("Minimum estimated shipping date"),
          orderIsComplete: z.boolean().describe("Whether order is complete"),
          listId: z.string().nullable().describe("List ID if from a list"),
          listType: z.string().nullable().describe("Type of list"),
          authorizedDate: z
            .string()
            .nullable()
            .describe("Payment authorization date"),
          callCenterOperatorName: z
            .string()
            .nullable()
            .describe("Call center operator name"),
          totalItems: z.number().describe("Total number of items"),
          currencyCode: z.string().describe("Currency code (BRL, USD, etc)"),
          hostname: z.string().describe("Store hostname"),
          invoiceOutput: z
            .array(z.any())
            .nullable()
            .describe("Output invoices"),
          invoiceInput: z.array(z.any()).nullable().describe("Input invoices"),
          lastChange: z.string().describe("Last change date"),
          isAllDelivered: z
            .boolean()
            .describe("Whether all items are delivered"),
          isAnyDelivered: z.boolean().describe("Whether any item is delivered"),
          giftCardProviders: z
            .array(z.any())
            .nullable()
            .describe("Gift card providers"),
          orderFormId: z.string().describe("Order form ID"),
          paymentApprovedDate: z
            .string()
            .nullable()
            .describe("Payment approval date"),
          readyForHandlingDate: z
            .string()
            .nullable()
            .describe("Ready for handling date"),
          deliveryDates: z.array(z.any()).nullable().describe("Delivery dates"),
          customFieldsValues: z
            .array(z.any())
            .nullable()
            .describe("Custom field values"),
          customFields: z.array(z.any()).describe("Custom fields"),
        }),
      ),
      paging: z
        .object({
          total: z.number().describe("Total number of orders"),
          pages: z.number().describe("Total number of pages"),
          currentPage: z.number().describe("Current page number"),
          perPage: z.number().describe("Items per page"),
        })
        .optional()
        .describe("Pagination information"),
    }),
    execute: async ({ context }) => {
      const client = new VTEXClient(getCredentials(env));
      return client.listOrders({
        page: context.page,
        per_page: context.perPage,
        orderBy: context.orderBy,
        q: context.q,
        f_status: context.status,
        f_creationDate: context.creationDate,
        f_authorizedDate: context.authorizedDate,
        f_invoicedDate: context.invoicedDate,
        f_hasInputInvoice: context.hasInputInvoice,
        f_shippingEstimate: context.shippingEstimate,
        f_UtmSource: context.utmSource,
        f_sellerNames: context.sellerNames,
        f_callCenterOperatorName: context.callCenterOperatorName,
        f_salesChannel: context.salesChannel,
        salesChannelId: context.salesChannelId,
        f_affiliateId: context.affiliateId,
        f_paymentNames: context.paymentNames,
        f_RnB: context.rnb,
        f_isInstore: context.isInstore,
        incompleteOrders: context.incompleteOrders,
        searchField: context.searchField,
      });
    },
  });
