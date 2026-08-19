import { createTool } from "@decocms/runtime/tools";
import { z } from "zod";
import type { Env } from "../../types/env.ts";
import {
  analyticsCompareEndDateSchema,
  analyticsCompareStartDateSchema,
  analyticsCurrencySchema,
  analyticsEndDateSchema,
  analyticsStartDateSchema,
  analyticsTimezoneSchema,
  buildAnalyticsConsumptionUrl,
  fetchAnalyticsConsumption,
} from "./analytics-consumption.ts";
import { resolveAnalyticsDateRange } from "./orders-oms.ts";

/**
 * Reverse-engineered from the admin "Performance de vendas" (Sales Performance)
 * dashboard. All three endpoints live under
 * `/api/analytics/consumption/{path}` and use the same VtexId session auth as
 * the home-analytics tools. See `.context/sales-performance-api-spec.md`.
 */

/** Valid `metricN` values accepted by the sales-performance endpoints. */
export const SALES_PERFORMANCE_METRICS = [
  "capturedRevenue",
  "approvedRevenue",
  "invoicedRevenue",
  "canceledRevenue",
  "capturedOrders",
  "approvedOrders",
  "invoicedOrders",
  "canceledOrders",
  "capturedItems",
  "approvedItems",
  "invoicedItems",
  "canceledItems",
  "capturedAverageTicket",
  "approvedAverageTicket",
  "invoicedAverageTicket",
  "canceledAverageTicket",
  "itemsPerOrder",
  "packagesPerOrder",
  "averageSellingPrice",
  "averageShippingPrice",
] as const;

/** Valid `groupByDim` values for the item detail table. */
export const SALES_PERFORMANCE_GROUP_BY = [
  "productName",
  "category",
  "brand",
  "marketplaceName",
  "deliveryMethod",
  "shippingOption",
  "destinationCity",
  "destinationState",
  "sellerName",
  "paymentMethod",
  "ownershipProduct",
  "campaign",
  "coupon",
  "tradePolicy",
  "promotion",
  "utmCampaign",
  "utmSource",
] as const;

/** The five metrics the dashboard shows by default. */
export const DEFAULT_SALES_PERFORMANCE_METRICS = [
  "capturedRevenue",
  "capturedOrders",
  "capturedAverageTicket",
  "itemsPerOrder",
  "averageSellingPrice",
] as const;

const salesMetricSchema = z.enum(SALES_PERFORMANCE_METRICS);

const salesMetricsListSchema = z
  .array(salesMetricSchema)
  .min(1)
  .max(5)
  .default([...DEFAULT_SALES_PERFORMANCE_METRICS])
  .describe(
    "Metrics to return, 1-5 (mapped to metric1..metric5). Endpoints expect at least two. Values: revenue/orders/items/averageTicket in captured|approved|invoiced|canceled variants, plus itemsPerOrder, packagesPerOrder, averageSellingPrice, averageShippingPrice.",
  );

const salesAggSchema = z
  .enum(["hour", "day", "week", "month"])
  .default("day")
  .describe("Time bucket granularity for the trend chart");

/** Map an ordered metric list to `metric1`..`metricN` query params. */
export function mapMetricsToParams(
  metrics: readonly string[],
): Record<string, string> {
  return metrics.reduce<Record<string, string>>((acc, metric, index) => {
    acc[`metric${index + 1}`] = metric;
    return acc;
  }, {});
}

export function buildSalesPerformanceCardsUrl(
  accountName: string,
  params: {
    currency: string;
    startDate: string;
    endDate: string;
    compareStartDate: string;
    compareEndDate: string;
    metrics: readonly string[];
  },
): string {
  return buildAnalyticsConsumptionUrl(accountName, "sp-cards", {
    an: accountName,
    currency: params.currency,
    startDate: params.startDate,
    endDate: params.endDate,
    compareStartDate: params.compareStartDate,
    compareEndDate: params.compareEndDate,
    ...mapMetricsToParams(params.metrics),
  });
}

export function buildSalesPerformanceTrendUrl(
  accountName: string,
  params: {
    currency: string;
    metric: string;
    agg: string;
    timezone: string;
    startDate: string;
    endDate: string;
    compareStartDate: string;
    compareEndDate: string;
  },
): string {
  return buildAnalyticsConsumptionUrl(accountName, "sp-graphic", {
    an: accountName,
    currency: params.currency,
    metric1: params.metric,
    agg: params.agg,
    timezone: params.timezone,
    startDate: params.startDate,
    endDate: params.endDate,
    compareStartDate: params.compareStartDate,
    compareEndDate: params.compareEndDate,
  });
}

export function buildSalesPerformanceTableUrl(
  accountName: string,
  params: {
    currency: string;
    groupBy: string;
    metrics: readonly string[];
    sortBy: string;
    sortOrientation: string;
    sortType: string;
    itemsPerPage: number;
    startIndex: number;
    startDate: string;
    endDate: string;
    compareStartDate: string;
    compareEndDate: string;
  },
): string {
  return buildAnalyticsConsumptionUrl(accountName, "sp-item-detail-table", {
    an: accountName,
    currency: params.currency,
    sortBy: params.sortBy,
    sortOrientation: params.sortOrientation,
    sortType: params.sortType,
    itemsPerPage: params.itemsPerPage,
    groupByDim: params.groupBy,
    startDate: params.startDate,
    endDate: params.endDate,
    compareStartDate: params.compareStartDate,
    compareEndDate: params.compareEndDate,
    ...mapMetricsToParams(params.metrics),
    startIndex: params.startIndex,
  });
}

export const getSalesPerformanceSummary = (_env: Env) =>
  createTool({
    id: "VTEX_GET_SALES_PERFORMANCE_SUMMARY",
    description:
      "Get the admin Sales Performance (Performance de vendas) KPI summary cards — reference window vs a comparison window — for revenue, orders, items, average ticket, etc. Internal analytics service (App Key/Token are exchanged for a session token under the hood). Defaults to today through now in BRL with the previous-day compare window.",
    annotations: { readOnlyHint: true },
    inputSchema: z.object({
      startDate: analyticsStartDateSchema,
      endDate: analyticsEndDateSchema,
      compareStartDate: analyticsCompareStartDateSchema,
      compareEndDate: analyticsCompareEndDateSchema,
      currency: analyticsCurrencySchema,
      metrics: salesMetricsListSchema,
      timezone: analyticsTimezoneSchema,
    }),
    execute: async ({ context, runtimeContext }) => {
      const env = runtimeContext.env as Env;
      const { accountName, appKey, appToken } = env.MESH_REQUEST_CONTEXT.state;
      const range = resolveAnalyticsDateRange(context);

      return fetchAnalyticsConsumption(
        { accountName, appKey, appToken },
        "sp-cards",
        {
          an: accountName,
          currency: context.currency,
          ...range,
          ...mapMetricsToParams(context.metrics),
        },
      );
    },
  });

export const getSalesPerformanceTrend = (_env: Env) =>
  createTool({
    id: "VTEX_GET_SALES_PERFORMANCE_TREND",
    description:
      "Get the admin Sales Performance (Performance de vendas) time-series trend for a single metric, with reference and comparison series bucketed by hour/day/week/month. Internal analytics service (App Key/Token are exchanged for a session token under the hood). Defaults to today through now in BRL with daily buckets and the previous-day compare window.",
    annotations: { readOnlyHint: true },
    inputSchema: z.object({
      startDate: analyticsStartDateSchema,
      endDate: analyticsEndDateSchema,
      compareStartDate: analyticsCompareStartDateSchema,
      compareEndDate: analyticsCompareEndDateSchema,
      currency: analyticsCurrencySchema,
      metric: salesMetricSchema
        .default("capturedRevenue")
        .describe("The single metric to plot over time"),
      agg: salesAggSchema,
      timezone: analyticsTimezoneSchema,
    }),
    execute: async ({ context, runtimeContext }) => {
      const env = runtimeContext.env as Env;
      const { accountName, appKey, appToken } = env.MESH_REQUEST_CONTEXT.state;
      const range = resolveAnalyticsDateRange(context);

      return fetchAnalyticsConsumption(
        { accountName, appKey, appToken },
        "sp-graphic",
        {
          an: accountName,
          currency: context.currency,
          metric1: context.metric,
          agg: context.agg,
          timezone: context.timezone,
          ...range,
        },
      );
    },
  });

export const getSalesPerformanceTable = (_env: Env) =>
  createTool({
    id: "VTEX_GET_SALES_PERFORMANCE_TABLE",
    description:
      "Get the admin Sales Performance (Performance de vendas) detail table — sales metrics broken down and ranked by a dimension (product/SKU, category, brand, seller, payment method, UTM, coupon, etc.), reference window vs a comparison window. The first row is always the aggregate 'total'. Supports sorting and pagination. Internal analytics service (App Key/Token are exchanged for a session token under the hood). Defaults to today through now in BRL grouped by product, sorted by captured revenue.",
    annotations: { readOnlyHint: true },
    inputSchema: z.object({
      startDate: analyticsStartDateSchema,
      endDate: analyticsEndDateSchema,
      compareStartDate: analyticsCompareStartDateSchema,
      compareEndDate: analyticsCompareEndDateSchema,
      currency: analyticsCurrencySchema,
      groupBy: z
        .enum(SALES_PERFORMANCE_GROUP_BY)
        .default("productName")
        .describe("Dimension to group and rank rows by"),
      metrics: salesMetricsListSchema,
      sortBy: salesMetricSchema
        .default("capturedRevenue")
        .describe("Metric to sort rows by (should be one of `metrics`)"),
      sortOrientation: z
        .enum(["DESC", "ASC"])
        .default("DESC")
        .describe("Sort direction"),
      sortType: z
        .enum(["percentage", "variation"])
        .default("percentage")
        .describe(
          "Sort by percentage share (percentage) or by absolute variation vs the compare window (variation)",
        ),
      itemsPerPage: z
        .number()
        .int()
        .min(1)
        .max(250)
        .default(10)
        .describe("Rows per page"),
      startIndex: z
        .number()
        .int()
        .min(0)
        .default(0)
        .describe("0-based pagination offset"),
      timezone: analyticsTimezoneSchema,
    }),
    execute: async ({ context, runtimeContext }) => {
      const env = runtimeContext.env as Env;
      const { accountName, appKey, appToken } = env.MESH_REQUEST_CONTEXT.state;
      const range = resolveAnalyticsDateRange(context);

      return fetchAnalyticsConsumption(
        { accountName, appKey, appToken },
        "sp-item-detail-table",
        {
          an: accountName,
          currency: context.currency,
          sortBy: context.sortBy,
          sortOrientation: context.sortOrientation,
          sortType: context.sortType,
          itemsPerPage: context.itemsPerPage,
          groupByDim: context.groupBy,
          ...range,
          ...mapMetricsToParams(context.metrics),
          startIndex: context.startIndex,
        },
      );
    },
  });
