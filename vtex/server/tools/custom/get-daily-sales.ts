/* eslint-disable @typescript-eslint/no-explicit-any */
import { createTool } from "@decocms/runtime/tools";
import { z } from "zod";
import * as ordersSdk from "../../generated/orders/sdk.gen.ts";
import type { Env } from "../../types/env.ts";
import { createVtexClient } from "../../lib/client-factory.ts";

interface ProductSalesAggregation {
  productId: string;
  productName: string;
  totalQuantity: number;
  totalRevenue: number;
  orderCount: number;
}

const productSalesSchema = z.object({
  productId: z.string(),
  productName: z.string(),
  totalQuantity: z.number(),
  totalRevenue: z.number(),
  orderCount: z.number(),
});

const outputSchema = z.object({
  dateFrom: z.string(),
  dateTo: z.string(),
  totalOrders: z.number(),
  processedOrders: z.number(),
  partial: z.boolean(),
  products: z.array(productSalesSchema),
});

/** Max time (ms) the entire tool execution is allowed to run before returning partial results. */
const OPERATION_TIMEOUT_MS = 20_000;
const CONCURRENCY_LIMIT = 5;

function aggregateOrders(orders: any[]): ProductSalesAggregation[] {
  const salesMap = new Map<string, ProductSalesAggregation>();

  for (const order of orders) {
    const seenProducts = new Set<string>();
    const items: any[] = order.items ?? [];

    for (const item of items) {
      const existing = salesMap.get(item.productId);
      const revenue = (item.sellingPrice * item.quantity) / 100;

      if (existing) {
        existing.totalQuantity += item.quantity;
        existing.totalRevenue += revenue;
        if (!seenProducts.has(item.productId)) {
          existing.orderCount += 1;
        }
      } else {
        salesMap.set(item.productId, {
          productId: item.productId,
          productName: item.name,
          totalQuantity: item.quantity,
          totalRevenue: revenue,
          orderCount: 1,
        });
      }

      seenProducts.add(item.productId);
    }
  }

  return Array.from(salesMap.values()).sort(
    (a, b) => b.totalQuantity - a.totalQuantity,
  );
}

export const getDailySales = (env: Env) =>
  createTool({
    id: "VTEX_GET_DAILY_SALES",
    description:
      "Get aggregated daily sales ranked by product. Returns a list of products sold in the given date range, sorted by total quantity sold (descending). Useful for short-term prioritization of product listing pages. Processes up to maxOrders orders (default 100, max 500). May return partial results if the operation approaches the time limit.",
    inputSchema: z.object({
      dateFrom: z
        .string()
        .optional()
        .describe(
          "Start date in ISO format (e.g., 2025-01-15T00:00:00.000Z). Defaults to start of today (UTC).",
        ),
      dateTo: z
        .string()
        .optional()
        .describe(
          "End date in ISO format (e.g., 2025-01-15T23:59:59.999Z). Defaults to end of today (UTC).",
        ),
      maxOrders: z.coerce
        .number()
        .optional()
        .describe(
          "Maximum number of orders to process for aggregation (default: 100, max: 500). Higher values give more accurate results but take longer.",
        ),
      status: z
        .string()
        .optional()
        .describe(
          "Filter by order status. Defaults to orders that completed payment (payment-approved, handling, invoiced). Use 'all' to include all statuses.",
        ),
    }),
    outputSchema,
    execute: async ({ context }) => {
      const startTime = Date.now();
      const client = createVtexClient(env.MESH_REQUEST_CONTEXT.state);

      const isTimeBudgetOk = () =>
        Date.now() - startTime < OPERATION_TIMEOUT_MS;

      const now = new Date();
      const startOfDay = new Date(
        Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()),
      );
      const endOfDay = new Date(
        Date.UTC(
          now.getUTCFullYear(),
          now.getUTCMonth(),
          now.getUTCDate(),
          23,
          59,
          59,
          999,
        ),
      );

      const dateFrom = context.dateFrom ?? startOfDay.toISOString();
      const dateTo = context.dateTo ?? endOfDay.toISOString();
      const maxOrders = Math.min(context.maxOrders ?? 100, 500);
      const perPage = Math.min(maxOrders, 100);
      const maxPages = Math.ceil(maxOrders / perPage);

      const statusFilter =
        context.status === "all" ? undefined : (context.status ?? undefined);

      // Phase 1: Collect order IDs from the list endpoint
      const orderIds: string[] = [];
      let totalOrders = 0;

      for (let page = 1; page <= maxPages; page++) {
        if (!isTimeBudgetOk()) break;

        const listResult = await ordersSdk.listOrders({
          client: client as any,
          query: {
            page,
            per_page: perPage,
            f_creationDate: `creationDate:[${dateFrom} TO ${dateTo}]`,
            ...(statusFilter && { f_status: statusFilter }),
            orderBy: "creationDate,desc",
          },
        } as any);

        if (listResult.error) break;

        const listData = listResult.data as any;
        totalOrders = listData?.paging?.total ?? totalOrders;

        for (const order of listData?.list ?? []) {
          orderIds.push(order.orderId);
        }

        const totalPages = listData?.paging?.pages ?? 0;
        if (page >= totalPages) break;
        if (orderIds.length >= maxOrders) break;
      }

      const limitedOrderIds = orderIds.slice(0, maxOrders);

      // Phase 2: Fetch order details in batches, respecting time budget
      const fetchedOrders: any[] = [];
      let partial = false;

      for (let i = 0; i < limitedOrderIds.length; i += CONCURRENCY_LIMIT) {
        if (!isTimeBudgetOk()) {
          partial = true;
          break;
        }

        const batch = limitedOrderIds.slice(i, i + CONCURRENCY_LIMIT);
        const settled = await Promise.allSettled(
          batch.map((orderId) =>
            ordersSdk.getOrder({
              client: client as any,
              path: { orderId },
            } as any),
          ),
        );

        for (const result of settled) {
          if (result.status === "fulfilled" && !result.value.error) {
            fetchedOrders.push(result.value.data);
          }
        }
      }

      // Phase 3: Aggregate results
      const products = aggregateOrders(fetchedOrders);

      return outputSchema.parse({
        dateFrom,
        dateTo,
        totalOrders,
        processedOrders: fetchedOrders.length,
        partial,
        products,
      });
    },
  });
