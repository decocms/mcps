import { z } from "zod";

export const DEFAULT_STORE_TIMEZONE = "-03:00";

export const salesPeriodSchema = z.enum(["today", "last_1h", "last_5min"]);
export type SalesPeriod = z.infer<typeof salesPeriodSchema>;

export interface PeriodStats {
  orders: number;
  totalValue: number;
}

export interface HourlyOrderBucket {
  hour: string;
  count: number;
  totalValue: number;
}

interface HourRange {
  hour: string;
  start: string;
  end: string;
}

interface ListOrdersPage {
  paging: {
    total: number;
  };
  stats?: {
    stats?: {
      totalValue?: Record<string, unknown>;
    };
  };
}

export interface OmsCredentials {
  accountName: string;
  appKey?: string;
  appToken?: string;
}

/** Truncate to whole seconds — VTEX analytics expects `.000Z`, not sub-second precision. */
export function formatVtexAnalyticsTimestamp(value: Date | string): string {
  const date = typeof value === "string" ? new Date(value) : value;
  return new Date(Math.floor(date.getTime() / 1000) * 1000).toISOString();
}

export function parseTimezoneOffsetMinutes(timezone: string): number {
  const match = timezone.match(/^([+-])(\d{2}):(\d{2})$/);
  if (!match) {
    return 0;
  }

  const sign = match[1] === "+" ? 1 : -1;
  return (
    sign * (Number.parseInt(match[2], 10) * 60 + Number.parseInt(match[3], 10))
  );
}

export function getTodayWindowInTimezone(timezone: string): {
  startDate: string;
  endDate: string;
  date: string;
} {
  const offsetMinutes = parseTimezoneOffsetMinutes(timezone);
  const now = new Date();
  const shifted = new Date(now.getTime() + offsetMinutes * 60_000);
  const year = shifted.getUTCFullYear();
  const month = shifted.getUTCMonth();
  const day = shifted.getUTCDate();
  const startMs = Date.UTC(year, month, day) - offsetMinutes * 60_000;
  const endMs = startMs + 86_400_000 - 1;

  return {
    startDate: new Date(startMs).toISOString(),
    endDate: new Date(endMs).toISOString(),
    date: `${year}-${String(month + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`,
  };
}

/** Start of the local calendar day through now — matches the admin home trend chart. */
export function getTodayTrendWindowInTimezone(
  timezone: string,
  now = new Date(),
): { startDate: string; endDate: string } {
  const offsetMinutes = parseTimezoneOffsetMinutes(timezone);
  const shifted = new Date(now.getTime() + offsetMinutes * 60_000);
  const year = shifted.getUTCFullYear();
  const month = shifted.getUTCMonth();
  const day = shifted.getUTCDate();
  const startMs = Date.UTC(year, month, day) - offsetMinutes * 60_000;

  return {
    startDate: formatVtexAnalyticsTimestamp(new Date(startMs)),
    endDate: formatVtexAnalyticsTimestamp(now),
  };
}

const DAY_MS = 86_400_000;

/** Previous calendar day with the same clock-time window — matches admin compare ranges. */
export function getCompareWindowForRange(
  startDate: string,
  endDate: string,
): { compareStartDate: string; compareEndDate: string } {
  return {
    compareStartDate: formatVtexAnalyticsTimestamp(
      new Date(new Date(startDate).getTime() - DAY_MS),
    ),
    compareEndDate: formatVtexAnalyticsTimestamp(
      new Date(new Date(endDate).getTime() - DAY_MS),
    ),
  };
}

export function resolveAnalyticsDateRange(input: {
  startDate?: string;
  endDate?: string;
  compareStartDate?: string;
  compareEndDate?: string;
  timezone: string;
  now?: Date;
}): {
  startDate: string;
  endDate: string;
  compareStartDate: string;
  compareEndDate: string;
} {
  const { startDate: defaultStart, endDate: defaultEnd } =
    getTodayTrendWindowInTimezone(input.timezone, input.now);

  const startDate = input.startDate
    ? formatVtexAnalyticsTimestamp(input.startDate)
    : defaultStart;
  const endDate = input.endDate
    ? formatVtexAnalyticsTimestamp(input.endDate)
    : defaultEnd;

  if (input.compareStartDate && input.compareEndDate) {
    return {
      startDate,
      endDate,
      compareStartDate: formatVtexAnalyticsTimestamp(input.compareStartDate),
      compareEndDate: formatVtexAnalyticsTimestamp(input.compareEndDate),
    };
  }

  const compare = getCompareWindowForRange(startDate, endDate);
  return { startDate, endDate, ...compare };
}

export function getCurrentLocalHourIndex(
  timezone: string,
  now = new Date(),
): number {
  const offsetMinutes = parseTimezoneOffsetMinutes(timezone);
  const totalMinutes =
    now.getUTCHours() * 60 + now.getUTCMinutes() + offsetMinutes;
  const normalized = ((totalMinutes % (24 * 60)) + 24 * 60) % (24 * 60);
  return Math.floor(normalized / 60);
}

export function getRollingRange(minutes: number): {
  start: string;
  end: string;
} {
  const end = new Date();
  const start = new Date(end.getTime() - minutes * 60 * 1000);

  return { start: start.toISOString(), end: end.toISOString() };
}

export function getDateRangeForPeriod(
  period: SalesPeriod,
  timezone: string,
): { start: string; end: string; date?: string } {
  if (period === "today") {
    const { startDate, endDate, date } = getTodayWindowInTimezone(timezone);
    return { start: startDate, end: endDate, date };
  }

  if (period === "last_1h") {
    return getRollingRange(60);
  }

  return getRollingRange(5);
}

export function buildOmsOrdersUrl(accountName: string): string {
  return `https://${accountName}.vtexcommercestable.com.br/api/oms/pvt/orders`;
}

export function buildOmsHeaders(creds: OmsCredentials): Record<string, string> {
  const { appKey, appToken } = creds;

  return {
    Accept: "application/json",
    "Content-Type": "application/json",
    ...(appKey && { "X-VTEX-API-AppKey": appKey }),
    ...(appToken && { "X-VTEX-API-AppToken": appToken }),
  };
}

function getHourRangesForLocalDate(
  date: string,
  timezone: string,
): HourRange[] {
  const offsetMinutes = parseTimezoneOffsetMinutes(timezone);
  const [year, month, day] = date.split("-").map(Number);
  const maxHour = getCurrentLocalHourIndex(timezone);

  return Array.from({ length: maxHour + 1 }, (_, index) => {
    const startMs =
      Date.UTC(year, month - 1, day, 0, 0, 0, 0) -
      offsetMinutes * 60_000 +
      index * 3_600_000;
    const endMs = startMs + 3_600_000 - 1;

    return {
      hour: `${String(index).padStart(2, "0")}:00`,
      start: new Date(startMs).toISOString(),
      end: new Date(endMs).toISOString(),
    };
  });
}

function padHourlyBuckets(fetched: HourlyOrderBucket[]): HourlyOrderBucket[] {
  const byHour = new Map(fetched.map((bucket) => [bucket.hour, bucket]));

  return Array.from({ length: 24 }, (_, index) => {
    const hour = `${String(index).padStart(2, "0")}:00`;
    return byHour.get(hour) ?? { hour, count: 0, totalValue: 0 };
  });
}

function isListOrdersPage(data: unknown): data is ListOrdersPage {
  return (
    typeof data === "object" &&
    data !== null &&
    "paging" in data &&
    typeof data.paging === "object" &&
    data.paging !== null &&
    "total" in data.paging &&
    typeof data.paging.total === "number"
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

function extractStatsSum(data: ListOrdersPage): number {
  const totalValue = data.stats?.stats?.totalValue;
  if (!totalValue || typeof totalValue !== "object") {
    return 0;
  }

  return (
    readNumericField(totalValue.Sum) ?? readNumericField(totalValue.sum) ?? 0
  );
}

export async function fetchRangeStats(
  baseUrl: string,
  headers: Record<string, string>,
  start: string,
  end: string,
): Promise<PeriodStats> {
  const params = new URLSearchParams({
    page: "1",
    per_page: "1",
    _stats: "1",
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

  return {
    orders: data.paging.total,
    totalValue: extractStatsSum(data),
  };
}

export async function fetchHourlyBuckets(
  baseUrl: string,
  headers: Record<string, string>,
  date: string,
  timezone: string,
): Promise<HourlyOrderBucket[]> {
  const hourRanges = getHourRangesForLocalDate(date, timezone);

  const fetched = await Promise.all(
    hourRanges.map(async (range) => {
      const stats = await fetchRangeStats(
        baseUrl,
        headers,
        range.start,
        range.end,
      );

      return {
        hour: range.hour,
        count: stats.orders,
        totalValue: stats.totalValue,
      };
    }),
  );

  return padHourlyBuckets(fetched);
}
