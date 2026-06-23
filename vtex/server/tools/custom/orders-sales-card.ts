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
} from "./orders-oms.ts";

const outputSchema = z.object({
  period: salesPeriodSchema,
  orders: z.number(),
  totalValue: z.number(),
  date: z.string().optional(),
});

export const ordersSalesCard = (_env: Env) =>
  createTool({
    id: "VTEX_ORDERS_SALES_CARD",
    description:
      "Sales summary card for a time window: today, last hour, or last 5 minutes. Uses OMS List Orders with _stats=1 (single request).",
    inputSchema: z.object({
      period: salesPeriodSchema.describe(
        'Time window: "today" (local calendar day), "last_1h", or "last_5min".',
      ),
    }),
    outputSchema,
    _meta: { ui: { resourceUri: VTEX_RESOURCE_URI } },
    annotations: { readOnlyHint: true },
    execute: async ({ context, runtimeContext }) => {
      const env = runtimeContext.env as Env;
      const { accountName, appKey, appToken } = env.MESH_REQUEST_CONTEXT.state;
      const timezone = DEFAULT_STORE_TIMEZONE;
      const { period } = context;
      const range = getDateRangeForPeriod(period, timezone);

      const creds = { accountName, appKey, appToken };
      const stats = await fetchRangeStats(
        buildOmsOrdersUrl(accountName),
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
    },
  });
