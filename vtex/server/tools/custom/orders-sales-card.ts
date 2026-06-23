import { createTool } from "@decocms/runtime/tools";
import { z } from "zod";
import { VTEX_RESOURCE_URI } from "../../constants.ts";
import type { Env } from "../../types/env.ts";
import {
  buildOmsHeaders,
  buildOmsOrdersUrl,
  DEFAULT_STORE_TIMEZONE,
  fetchRangeStats,
  getDateRangeForPeriod,
  salesPeriodSchema,
  type SalesPeriod,
} from "./orders-oms.ts";

const ALL_SALES_PERIODS = ["today", "last_1h", "last_5min"] as const;

const salesCardSchema = z.object({
  period: salesPeriodSchema,
  orders: z.number(),
  totalValue: z.number(),
  date: z.string().optional(),
});

const outputSchema = z.object({
  cards: z.array(salesCardSchema),
});

async function fetchSalesCard(
  period: SalesPeriod,
  creds: { accountName: string; appKey?: string; appToken?: string },
  timezone: string,
) {
  const range = getDateRangeForPeriod(period, timezone);
  const stats = await fetchRangeStats(
    buildOmsOrdersUrl(creds.accountName),
    buildOmsHeaders(creds),
    range.start,
    range.end,
  );

  return {
    period,
    orders: stats.orders,
    totalValue: stats.totalValue,
    ...(range.date ? { date: range.date } : {}),
  };
}

export const ordersSalesCard = (_env: Env) =>
  createTool({
    id: "VTEX_ORDERS_SALES_CARD",
    description:
      "Sales summary cards for today, last hour, and last 5 minutes (default). Uses OMS List Orders with _stats=1. Pass an optional period to fetch a single window only.",
    inputSchema: z.object({
      period: salesPeriodSchema
        .optional()
        .describe(
          'Optional single window: "today", "last_1h", or "last_5min". Omit to return all three.',
        ),
    }),
    outputSchema,
    _meta: { ui: { resourceUri: VTEX_RESOURCE_URI } },
    annotations: { readOnlyHint: true },
    execute: async ({ context, runtimeContext }) => {
      const env = runtimeContext.env as Env;
      const { accountName, appKey, appToken } = env.MESH_REQUEST_CONTEXT.state;
      const timezone = DEFAULT_STORE_TIMEZONE;
      const creds = { accountName, appKey, appToken };
      const periods = context.period
        ? [context.period]
        : [...ALL_SALES_PERIODS];

      const cards = await Promise.all(
        periods.map((period) => fetchSalesCard(period, creds, timezone)),
      );

      return { cards };
    },
  });
