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
  hasUsableTrendChartData,
  parseAnalyticsHourlyBuckets,
  resolveOrdersTrendParams,
} from "./orders-trend.ts";

const DEFAULT_STORE_CURRENCY = "BRL";

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
      "Fetch today's orders aggregated by hour for a bar chart. Uses the admin home orders trend analytics endpoint (single request).",
    inputSchema: z.object({}),
    outputSchema,
    _meta: { ui: { resourceUri: VTEX_RESOURCE_URI } },
    annotations: { readOnlyHint: true },
    execute: async ({ runtimeContext }) => {
      const env = runtimeContext.env as Env;
      const { accountName, appKey, appToken, currency } =
        env.MESH_REQUEST_CONTEXT.state;
      const timezone = DEFAULT_STORE_TIMEZONE;
      const storeCurrency = currency ?? DEFAULT_STORE_CURRENCY;
      const { date } = getTodayWindowInTimezone(timezone);
      const params = resolveOrdersTrendParams({
        agg: "hour",
        currency: storeCurrency,
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

      if (!hasUsableTrendChartData(trend)) {
        throw new Error(
          "VTEX analytics returned empty trend data (null placeholders). Check store currency and app key access to admin analytics.",
        );
      }

      return {
        hours: parseAnalyticsHourlyBuckets(trend, timezone),
        date,
      };
    },
  });
