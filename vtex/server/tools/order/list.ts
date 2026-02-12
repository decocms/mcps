import { createTool } from "@decocms/runtime/tools";
import { z } from "zod";
import { VTEXClient } from "../../lib/client.ts";
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
    execute: async ({ context }) => {
      const credentials = env.MESH_REQUEST_CONTEXT.state;
      const client = new VTEXClient(credentials);
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
