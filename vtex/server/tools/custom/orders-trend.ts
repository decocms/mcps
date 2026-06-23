import { createTool } from "@decocms/runtime/tools";
import { z } from "zod";
import type { Env } from "../../types/env.ts";
import {
  buildAnalyticsConsumptionUrl,
  fetchAnalyticsConsumption,
} from "./analytics-consumption.ts";
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

const CHART_POINT_KEYS = ["dataChart", "DataChart", "chart", "data", "series"];

function readNumericField(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }

  if (typeof value === "string" && value.trim() !== "") {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }

  return null;
}

function unwrapTrendPayload(data: unknown): unknown {
  if (typeof data !== "string") {
    return data;
  }

  try {
    return unwrapTrendPayload(JSON.parse(data));
  } catch {
    return data;
  }
}

function isChartPointLike(value: unknown): value is Record<string, unknown> {
  return (
    typeof value === "object" &&
    value !== null &&
    ("date" in value || "orders" in value)
  );
}

function coerceChartPoints(value: unknown): OrdersTrendChartPoint[] | null {
  if (value === null || value === undefined) {
    return [];
  }

  if (Array.isArray(value)) {
    if (value.length === 0 || value.every(isChartPointLike)) {
      return value as OrdersTrendChartPoint[];
    }
  }

  return null;
}

function findChartPoints(data: unknown): OrdersTrendChartPoint[] | null {
  const unwrapped = unwrapTrendPayload(data);

  const direct = coerceChartPoints(unwrapped);
  if (direct !== null) {
    return direct;
  }

  if (typeof unwrapped !== "object" || unwrapped === null) {
    return null;
  }

  const record = unwrapped as Record<string, unknown>;

  for (const key of CHART_POINT_KEYS) {
    if (!(key in record)) {
      continue;
    }

    const nested = findChartPoints(record[key]);
    if (nested !== null) {
      return nested;
    }
  }

  // VTEX wraps chart data under endpoint-specific keys, e.g. ordersTrendData.
  for (const value of Object.values(record)) {
    if (typeof value !== "object" || value === null || Array.isArray(value)) {
      continue;
    }

    const nested = findChartPoints(value);
    if (nested !== null) {
      return nested;
    }
  }

  return null;
}

function describeTrendPayload(data: unknown): string {
  const unwrapped = unwrapTrendPayload(data);

  if (unwrapped === null) {
    return "null";
  }

  if (Array.isArray(unwrapped)) {
    return `array(length=${unwrapped.length})`;
  }

  if (typeof unwrapped === "object") {
    return `object(keys=${Object.keys(unwrapped).join(",") || "none"})`;
  }

  return typeof unwrapped;
}

export function extractOrdersTrendChartPoints(
  data: unknown,
): OrdersTrendChartPoint[] {
  const points = findChartPoints(data);

  if (points === null) {
    throw new Error(
      `Invalid VTEX orders trend response: ${describeTrendPayload(data)}`,
    );
  }

  return points;
}

/** True when the trend payload has at least one bucket with date + order count. */
export function hasUsableTrendChartData(data: unknown): boolean {
  const points = extractOrdersTrendChartPoints(data);
  return points.some(
    (point) => point.date !== null && readNumericField(point.orders) !== null,
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
  const chartPoints = extractOrdersTrendChartPoints(data);
  const byHour = new Map<string, HourlyOrderBucket>();

  for (const point of chartPoints) {
    if (!point.date) {
      continue;
    }

    const count = readNumericField(point.orders);
    if (count === null) {
      continue;
    }

    const hour = hourLabelInTimezone(point.date, timezone);
    byHour.set(hour, {
      hour,
      count,
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
      const params = resolveOrdersTrendParams(context);

      return fetchAnalyticsConsumption(
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
    },
  });
