import { createTool } from "@decocms/runtime/tools";
import { z } from "zod";
import { VTEX_RESOURCE_URI } from "../../constants.ts";
import type { Env } from "../../types/env.ts";
import { fetchAnalyticsConsumption } from "./analytics-consumption.ts";
import {
  DEFAULT_STORE_TIMEZONE,
  getTodayWindowInTimezone,
} from "./orders-oms.ts";
import {
  parseAnalyticsHourlyBuckets,
  resolveOrdersTrendParams,
} from "./orders-trend.ts";

const hourBucketSchema = z.object({
  hour: z.string(),
  count: z.number(),
  totalValue: z.number(),
});

const outputSchema = z.object({
  hours: z.array(hourBucketSchema),
  date: z.string(),
});

export const ordersTimeline = (_env: Env) =>
  createTool({
    id: "VTEX_ORDERS_TIMELINE",
    description:
      "Fetch today's orders aggregated by hour for a bar chart. Uses the admin home orders trend analytics endpoint (single request via VTEX_GET_ORDERS_TREND).",
    inputSchema: z.object({}),
    outputSchema,
    _meta: { ui: { resourceUri: VTEX_RESOURCE_URI } },
    annotations: { readOnlyHint: true },
    execute: async ({ runtimeContext }) => {
      const env = runtimeContext.env as Env;
      const { accountName, appKey, appToken } = env.MESH_REQUEST_CONTEXT.state;
      const timezone = DEFAULT_STORE_TIMEZONE;
      const { date } = getTodayWindowInTimezone(timezone);
      const params = resolveOrdersTrendParams({
        agg: "hour",
        currency: "BRL",
        timezone,
      });

      const trend = await fetchAnalyticsConsumption(
        { accountName, appKey, appToken },
        "home-orders-trend",
        {
          an: accountName,
          currency: params.currency,
          startDate: params.startDate,
          endDate: params.endDate,
          agg: params.agg,
          timezone: params.timezone,
        },
      );

      const hours = parseAnalyticsHourlyBuckets(trend, timezone);

      return { hours, date };
    },
  });
