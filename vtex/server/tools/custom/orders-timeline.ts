import { createTool } from "@decocms/runtime/tools";
import { z } from "zod";
import { VTEX_RESOURCE_URI } from "../../constants.ts";
import type { Env } from "../../types/env.ts";

const hourBucketSchema = z.object({
  hour: z.string(),
  count: z.number(),
  totalValue: z.number(),
});

const periodStatsSchema = z.object({
  orders: z.number(),
  totalValue: z.number(),
});

const outputSchema = z.object({
  hours: z.array(hourBucketSchema),
  today: periodStatsSchema,
  lastHour: periodStatsSchema,
  last5Minutes: periodStatsSchema,
  date: z.string(),
});

interface HourRange {
  hour: string;
  start: string;
  end: string;
}

interface PeriodStats {
  orders: number;
  totalValue: number;
}

interface ListOrderItem {
  totalValue?: number;
}

interface ListOrdersPage {
  list: ListOrderItem[];
  paging: {
    total: number;
    pages: number;
    currentPage: number;
  };
  stats?: {
    stats?: {
      totalValue?: Record<string, unknown>;
    };
  };
}

const MAX_PAGES = 30;
const PAGE_SIZE = 100;

function getTodayUtcDate(): string {
  const now = new Date();
  return new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()),
  )
    .toISOString()
    .slice(0, 10);
}

function getTodayRange(): { start: string; end: string } {
  const now = new Date();
  const start = new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()),
  );
  const end = new Date(
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

  return { start: start.toISOString(), end: end.toISOString() };
}

function getRollingRange(minutes: number): { start: string; end: string } {
  const end = new Date();
  const start = new Date(end.getTime() - minutes * 60 * 1000);

  return { start: start.toISOString(), end: end.toISOString() };
}

function getHourRanges(date: string): HourRange[] {
  const [year, month, day] = date.split("-").map(Number);

  return Array.from({ length: 24 }, (_, index) => {
    const start = new Date(Date.UTC(year, month - 1, day, index, 0, 0, 0));
    const end = new Date(Date.UTC(year, month - 1, day, index, 59, 59, 999));

    return {
      hour: `${String(index).padStart(2, "0")}:00`,
      start: start.toISOString(),
      end: end.toISOString(),
    };
  });
}

function isListOrdersPage(data: unknown): data is ListOrdersPage {
  return (
    typeof data === "object" &&
    data !== null &&
    "list" in data &&
    Array.isArray(data.list) &&
    "paging" in data &&
    typeof data.paging === "object" &&
    data.paging !== null &&
    "total" in data.paging &&
    typeof data.paging.total === "number" &&
    "pages" in data.paging &&
    typeof data.paging.pages === "number"
  );
}

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

function extractStatsSum(data: ListOrdersPage): number | null {
  const totalValue = data.stats?.stats?.totalValue;
  if (!totalValue || typeof totalValue !== "object") {
    return null;
  }

  return (
    readNumericField(totalValue.Sum) ??
    readNumericField(totalValue.sum) ??
    readNumericField(totalValue.Value) ??
    readNumericField(totalValue.value)
  );
}

function sumListValues(list: ListOrderItem[]): number {
  let total = 0;

  for (const item of list) {
    const value = readNumericField(item.totalValue);
    if (value !== null) {
      total += value;
    }
  }

  return total;
}

async function fetchListOrdersPage(
  baseUrl: string,
  headers: Record<string, string>,
  start: string,
  end: string,
  page: number,
): Promise<ListOrdersPage> {
  const params = new URLSearchParams({
    page: String(page),
    per_page: String(PAGE_SIZE),
    f_creationDate: `creationDate:[${start} TO ${end}]`,
  });
  const url = `${baseUrl}?${params.toString()}`;
  console.log("[VTEX] GET", url);

  const response = await fetch(url, { headers });
  if (!response.ok) {
    throw new Error(
      `VTEX API Error: ${response.status} - ${await response.text()}`,
    );
  }

  const data: unknown = await response.json();
  if (!isListOrdersPage(data)) {
    throw new Error("Invalid VTEX List Orders response");
  }

  return data;
}

async function fetchPeriodStats(
  baseUrl: string,
  headers: Record<string, string>,
  start: string,
  end: string,
): Promise<PeriodStats> {
  let page = 1;
  let orders = 0;
  let listSum = 0;
  let statsSum: number | null = null;

  while (page <= MAX_PAGES) {
    const data = await fetchListOrdersPage(baseUrl, headers, start, end, page);
    orders = data.paging.total;

    if (page === 1) {
      statsSum = extractStatsSum(data);
    }

    listSum += sumListValues(data.list);

    if (page >= data.paging.pages) {
      break;
    }

    page += 1;
  }

  const totalValue =
    statsSum !== null && statsSum > 0
      ? statsSum
      : listSum > 0
        ? listSum
        : (statsSum ?? 0);

  return { orders, totalValue };
}

async function fetchHourStats(
  baseUrl: string,
  headers: Record<string, string>,
  range: HourRange,
): Promise<{ hour: string; count: number; totalValue: number }> {
  const data = await fetchListOrdersPage(
    baseUrl,
    headers,
    range.start,
    range.end,
    1,
  );

  const statsSum = extractStatsSum(data);
  const listSum = sumListValues(data.list);

  return {
    hour: range.hour,
    count: data.paging.total,
    totalValue:
      statsSum !== null && statsSum > 0
        ? statsSum
        : listSum > 0
          ? listSum
          : (statsSum ?? 0),
  };
}

export const ordersTimeline = (_env: Env) =>
  createTool({
    id: "VTEX_ORDERS_TIMELINE",
    description:
      "Fetch today's orders aggregated by hour plus sales summaries for today, last hour, and last 5 minutes.",
    inputSchema: z.object({}),
    outputSchema,
    _meta: { ui: { resourceUri: VTEX_RESOURCE_URI } },
    annotations: { readOnlyHint: true },
    execute: async ({ runtimeContext }) => {
      const env = runtimeContext.env as Env;
      const credentials = env.MESH_REQUEST_CONTEXT.state;
      const { accountName, appKey, appToken } = credentials;
      const date = getTodayUtcDate();
      const hourRanges = getHourRanges(date);
      const todayRange = getTodayRange();
      const lastHourRange = getRollingRange(60);
      const last5MinutesRange = getRollingRange(5);

      const baseUrl = `https://${accountName}.vtexcommercestable.com.br/api/oms/pvt/orders`;
      const headers: Record<string, string> = {
        Accept: "application/json",
        "Content-Type": "application/json",
        ...(appKey && { "X-VTEX-API-AppKey": appKey }),
        ...(appToken && { "X-VTEX-API-AppToken": appToken }),
      };

      const [hours, today, lastHour, last5Minutes] = await Promise.all([
        Promise.all(
          hourRanges.map((range) => fetchHourStats(baseUrl, headers, range)),
        ),
        fetchPeriodStats(baseUrl, headers, todayRange.start, todayRange.end),
        fetchPeriodStats(
          baseUrl,
          headers,
          lastHourRange.start,
          lastHourRange.end,
        ),
        fetchPeriodStats(
          baseUrl,
          headers,
          last5MinutesRange.start,
          last5MinutesRange.end,
        ),
      ]);

      const ordersFromHours = hours.reduce(
        (sum, bucket) => sum + bucket.count,
        0,
      );
      const valueFromHours = hours.reduce(
        (sum, bucket) => sum + bucket.totalValue,
        0,
      );

      return {
        hours,
        today: {
          orders: today.orders > 0 ? today.orders : ordersFromHours,
          totalValue: today.totalValue > 0 ? today.totalValue : valueFromHours,
        },
        lastHour,
        last5Minutes,
        date,
      };
    },
  });
