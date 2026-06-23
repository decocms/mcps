import { createTool } from "@decocms/runtime/tools";
import { z } from "zod";
import type { Env } from "../../types/env.ts";
import {
  getVtexIdSessionToken,
  vtexIdCookieHeader,
} from "../../lib/vtexid-session.ts";
import { buildAnalyticsConsumptionUrl } from "./analytics-consumption.ts";
import {
  DEFAULT_STORE_TIMEZONE,
  formatVtexAnalyticsTimestamp,
  getTodayTrendWindowInTimezone,
  parseTimezoneOffsetMinutes,
  type HourlyOrderBucket,
} from "./orders-oms.ts";

interface OrdersTrendChartPoint {
  date: string | null;
  orders: number | null;
}

interface OrdersTrendResponse {
  dataChart: OrdersTrendChartPoint[];
}

function isOrdersTrendResponse(data: unknown): data is OrdersTrendResponse {
  return (
    typeof data === "object" &&
    data !== null &&
    "dataChart" in data &&
    Array.isArray(data.dataChart)
  );
}

export function hourLabelInTimezone(isoDate: string, timezone: string): string {
  const offsetMinutes = parseTimezoneOffsetMinutes(timezone);
  const date = new Date(isoDate);
  const totalMinutes =
    date.getUTCHours() * 60 + date.getUTCMinutes() + offsetMinutes;
  const normalized = ((totalMinutes % (24 * 60)) + 24 * 60) % (24 * 60);
  return `${String(Math.floor(normalized / 60)).padStart(2, "0")}:00`;
}

/** Maps admin home-orders-trend `dataChart` into 24 local hour buckets for the MCP App UI. */
export function parseAnalyticsHourlyBuckets(
  data: unknown,
  timezone: string,
): HourlyOrderBucket[] {
  if (!isOrdersTrendResponse(data)) {
    throw new Error("Invalid VTEX orders trend response");
  }

  const byHour = new Map<string, HourlyOrderBucket>();

  for (const point of data.dataChart) {
    if (!point.date || point.orders === null) {
      continue;
    }

    const hour = hourLabelInTimezone(point.date, timezone);
    byHour.set(hour, {
      hour,
      count: point.orders,
      totalValue: 0,
    });
  }

  return Array.from({ length: 24 }, (_, index) => {
    const hour = `${String(index).padStart(2, "0")}:00`;
    return byHour.get(hour) ?? { hour, count: 0, totalValue: 0 };
  });
}

/**
 * VTEX's admin home dashboard charts are served by an INTERNAL microservice at
 * `/api/analytics/consumption/*`. It is NOT part of VTEX's public OpenAPI specs,
 * so there is no generated tool for it — hence this hand-crafted tool.
 *
 * That service rejects the usual App Key/Token headers and only accepts a VtexId
 * session token, so we mint one from the credentials via the shared
 * `lib/vtexid-session` helper. Any future internal-endpoint tool should reuse it.
 */

export interface OrdersTrendParams {
  startDate: string;
  endDate: string;
  agg: string;
  currency: string;
  timezone: string;
}

export function buildOrdersTrendUrl(
  accountName: string,
  params: OrdersTrendParams,
): string {
  return buildAnalyticsConsumptionUrl(accountName, "home-orders-trend", {
    an: accountName,
    currency: params.currency,
    startDate: params.startDate,
    endDate: params.endDate,
    agg: params.agg,
    timezone: params.timezone,
  });
}

export function resolveOrdersTrendParams(input: {
  startDate?: string;
  endDate?: string;
  agg: string;
  currency: string;
  timezone: string;
  now?: Date;
}): OrdersTrendParams {
  const { startDate: defaultStart, endDate: defaultEnd } =
    getTodayTrendWindowInTimezone(input.timezone, input.now);

  return {
    startDate: input.startDate
      ? formatVtexAnalyticsTimestamp(input.startDate)
      : defaultStart,
    endDate: input.endDate
      ? formatVtexAnalyticsTimestamp(input.endDate)
      : defaultEnd,
    agg: input.agg,
    currency: input.currency,
    timezone: input.timezone,
  };
}

// Read per-request env from `runtimeContext` — see comment in
// lib/tool-adapter.ts for why the factory's captured env is unsafe to read
// inside execute (cached registrations + fresh per-request bindings).
export const getOrdersTrend = (_env: Env) =>
  createTool({
    id: "VTEX_GET_ORDERS_TREND",
    description:
      "Get the admin home dashboard orders trend: order counts bucketed over time with anomaly forecast bands (mid/high confidence intervals and a HIGH/NORMAL status per bucket). Backed by VTEX's internal analytics service — requires App Key/Token, which are exchanged for a session token under the hood. Defaults to today's window (local midnight through now) in BRL with hourly buckets at -03:00.",
    annotations: { readOnlyHint: true },
    inputSchema: z.object({
      startDate: z
        .string()
        .optional()
        .describe(
          "Start of the window, ISO 8601 UTC. Defaults to local midnight in timezone.",
        ),
      endDate: z
        .string()
        .optional()
        .describe("End of the window, ISO 8601 UTC. Defaults to now."),
      agg: z
        .enum(["hour", "day", "week", "month"])
        .default("hour")
        .describe("Time bucket granularity for the trend"),
      currency: z
        .string()
        .default("BRL")
        .describe("Currency code matching the store, e.g. BRL, USD"),
      timezone: z
        .string()
        .default(DEFAULT_STORE_TIMEZONE)
        .describe("Timezone offset used for bucketing, e.g. -03:00"),
    }),
    execute: async ({ context, runtimeContext }) => {
      const env = runtimeContext.env as Env;
      const { accountName, appKey, appToken } = env.MESH_REQUEST_CONTEXT.state;

      const token = await getVtexIdSessionToken({
        accountName,
        appKey,
        appToken,
      });

      const params = resolveOrdersTrendParams(context);
      const url = buildOrdersTrendUrl(accountName, params);

      const response = await fetch(url, {
        headers: {
          Accept: "application/json",
          Cookie: vtexIdCookieHeader(token),
        },
      });

      if (!response.ok) {
        throw new Error(
          `VTEX API Error: ${response.status} - ${await response.text()}`,
        );
      }

      return response.json();
    },
  });
