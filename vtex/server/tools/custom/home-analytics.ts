import { createTool } from "@decocms/runtime/tools";
import { z } from "zod";
import type { Env } from "../../types/env.ts";
import {
  analyticsAggSchema,
  analyticsCompareEndDateSchema,
  analyticsCompareStartDateSchema,
  analyticsCurrencySchema,
  analyticsEndDateSchema,
  analyticsStartDateSchema,
  analyticsTimezoneSchema,
  buildAnalyticsConsumptionUrl,
  fetchAnalyticsConsumption,
} from "./analytics-consumption.ts";
import {
  formatVtexAnalyticsTimestamp,
  getTodayTrendWindowInTimezone,
  resolveAnalyticsDateRange,
} from "./orders-oms.ts";

export function buildHomeMetricsSummaryUrl(
  accountName: string,
  params: {
    currency: string;
    agg: string;
    startDate: string;
    endDate: string;
    compareStartDate: string;
    compareEndDate: string;
  },
): string {
  return buildAnalyticsConsumptionUrl(accountName, "home-metrics-summary-v2", {
    an: accountName,
    currency: params.currency,
    agg: params.agg,
    startDate: params.startDate,
    endDate: params.endDate,
    compareStartDate: params.compareStartDate,
    compareEndDate: params.compareEndDate,
  });
}

export function buildHomeTopViewedProductsUrl(
  accountName: string,
  params: {
    startDate: string;
    endDate: string;
    size: number;
  },
): string {
  return buildAnalyticsConsumptionUrl(accountName, "home-top-viewed-products", {
    startDate: params.startDate,
    endDate: params.endDate,
    an: accountName,
    size: params.size,
  });
}

export function buildHomeTopProductsUrl(
  accountName: string,
  params: {
    currency: string;
    startDate: string;
    endDate: string;
    compareStartDate: string;
    compareEndDate: string;
    sort: string;
    sort_ref: string;
  },
): string {
  return buildAnalyticsConsumptionUrl(accountName, "home-top-products-v2", {
    an: accountName,
    currency: params.currency,
    startDate: params.startDate,
    endDate: params.endDate,
    compareStartDate: params.compareStartDate,
    compareEndDate: params.compareEndDate,
    sort: params.sort,
    sort_ref: params.sort_ref,
  });
}

export function resolveTopViewedProductsParams(input: {
  startDate?: string;
  endDate?: string;
  size: number;
  timezone: string;
  now?: Date;
}): { startDate: string; endDate: string; size: number } {
  const { startDate: defaultStart, endDate: defaultEnd } =
    getTodayTrendWindowInTimezone(input.timezone, input.now);

  return {
    startDate: input.startDate
      ? formatVtexAnalyticsTimestamp(input.startDate)
      : defaultStart,
    endDate: input.endDate
      ? formatVtexAnalyticsTimestamp(input.endDate)
      : defaultEnd,
    size: input.size,
  };
}

export const getHomeMetricsSummary = (_env: Env) =>
  createTool({
    id: "VTEX_GET_HOME_METRICS_SUMMARY",
    description:
      "Get the admin home dashboard metrics summary (revenue, orders, sessions, conversion, etc.) for the current window vs the previous day. Internal analytics service — App Key/Token are exchanged for a session token under the hood. Defaults to today through now in BRL with hourly aggregation.",
    annotations: { readOnlyHint: true },
    inputSchema: z.object({
      startDate: analyticsStartDateSchema,
      endDate: analyticsEndDateSchema,
      compareStartDate: analyticsCompareStartDateSchema,
      compareEndDate: analyticsCompareEndDateSchema,
      agg: analyticsAggSchema,
      currency: analyticsCurrencySchema,
      timezone: analyticsTimezoneSchema,
    }),
    execute: async ({ context, runtimeContext }) => {
      const env = runtimeContext.env as Env;
      const { accountName, appKey, appToken } = env.MESH_REQUEST_CONTEXT.state;
      const range = resolveAnalyticsDateRange(context);

      return fetchAnalyticsConsumption(
        { accountName, appKey, appToken },
        "home-metrics-summary-v2",
        {
          an: accountName,
          currency: context.currency,
          agg: context.agg,
          ...range,
        },
      );
    },
  });

export const getHomeTopViewedProducts = (_env: Env) =>
  createTool({
    id: "VTEX_GET_HOME_TOP_VIEWED_PRODUCTS",
    description:
      "Get the most viewed products on the admin home dashboard for the selected window. Internal analytics service — App Key/Token are exchanged for a session token under the hood. Defaults to today through now.",
    annotations: { readOnlyHint: true },
    inputSchema: z.object({
      startDate: analyticsStartDateSchema,
      endDate: analyticsEndDateSchema,
      size: z
        .number()
        .int()
        .min(1)
        .max(500)
        .default(100)
        .describe("Maximum number of products to return"),
      timezone: analyticsTimezoneSchema,
    }),
    execute: async ({ context, runtimeContext }) => {
      const env = runtimeContext.env as Env;
      const { accountName, appKey, appToken } = env.MESH_REQUEST_CONTEXT.state;
      const params = resolveTopViewedProductsParams(context);

      return fetchAnalyticsConsumption(
        { accountName, appKey, appToken },
        "home-top-viewed-products",
        {
          startDate: params.startDate,
          endDate: params.endDate,
          an: accountName,
          size: params.size,
        },
      );
    },
  });

export const getHomeTopProducts = (_env: Env) =>
  createTool({
    id: "VTEX_GET_HOME_TOP_PRODUCTS",
    description:
      "Get top-selling products on the admin home dashboard ranked by revenue (or another sort) for the current window vs the previous day. Internal analytics service — App Key/Token are exchanged for a session token under the hood. Defaults to today through now in BRL sorted by revenue.",
    annotations: { readOnlyHint: true },
    inputSchema: z.object({
      startDate: analyticsStartDateSchema,
      endDate: analyticsEndDateSchema,
      compareStartDate: analyticsCompareStartDateSchema,
      compareEndDate: analyticsCompareEndDateSchema,
      currency: analyticsCurrencySchema,
      sort: z
        .string()
        .default("REVENUESort")
        .describe("Sort field, e.g. REVENUESort, QUANTITYSort"),
      sort_ref: z
        .string()
        .default("REVENUERef")
        .describe("Comparison reference field, e.g. REVENUERef, QUANTITYRef"),
      timezone: analyticsTimezoneSchema,
    }),
    execute: async ({ context, runtimeContext }) => {
      const env = runtimeContext.env as Env;
      const { accountName, appKey, appToken } = env.MESH_REQUEST_CONTEXT.state;
      const range = resolveAnalyticsDateRange(context);

      return fetchAnalyticsConsumption(
        { accountName, appKey, appToken },
        "home-top-products-v2",
        {
          an: accountName,
          currency: context.currency,
          ...range,
          sort: context.sort,
          sort_ref: context.sort_ref,
        },
      );
    },
  });
