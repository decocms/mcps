import { createTool } from "@decocms/runtime/tools";
import { z } from "zod";
import { VTEX_ORDERS_TIMELINE_RESOURCE_URI } from "../../constants.ts";
import type { Env } from "../../types/env.ts";
import { fetchAnalyticsConsumption } from "./analytics-consumption.ts";
import {
  buildOmsHeaders,
  buildOmsOrdersUrl,
  DEFAULT_STORE_TIMEZONE,
  fetchHourlyBuckets,
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
      "Fetch today's orders aggregated by hour for a bar chart. Uses the admin home orders trend analytics endpoint (single request), falling back to per-hour OMS order-list aggregation when analytics is unavailable.",
    inputSchema: z.object({}),
    outputSchema,
    _meta: { ui: { resourceUri: VTEX_ORDERS_TIMELINE_RESOURCE_URI } },
    annotations: { readOnlyHint: true },
    execute: async ({ runtimeContext }) => {
      const env = runtimeContext.env as Env;
      const { accountName, appKey, appToken, currency } =
        env.MESH_REQUEST_CONTEXT.state;
      const timezone = DEFAULT_STORE_TIMEZONE;
      const storeCurrency = currency ?? DEFAULT_STORE_CURRENCY;
      const { date } = getTodayWindowInTimezone(timezone);

      const fallbackToOms = async () => {
        const hours = await fetchHourlyBuckets(
          buildOmsOrdersUrl(accountName),
          buildOmsHeaders({ accountName, appKey, appToken }),
          date,
          timezone,
        );
        return { hours, date };
      };

      // Primary: the admin home trend analytics endpoint (single request, fast).
      // It requires the app key to have admin analytics access and the store
      // currency to be configured; when either is missing it returns null
      // placeholders. In that case we fall back to aggregating the OMS orders
      // list one hour at a time (24 parallel requests) which only needs
      // standard OMS access and also yields per-hour totalValue.
      try {
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
          return await fallbackToOms();
        }

        return {
          hours: parseAnalyticsHourlyBuckets(trend, timezone),
          date,
        };
      } catch (_error) {
        return await fallbackToOms();
      }
    },
  });
