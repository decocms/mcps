/**
 * Timezone-safe window math for Magento reporting.
 *
 * Magento stores `created_at` in UTC using MySQL format
 * ("YYYY-MM-DD HH:MM:SS", no zone suffix) and searchCriteria date filters
 * expect the same format. "Today" must be computed in the store's local
 * timezone and converted back to UTC. Ported from
 * vtex/server/tools/custom/orders-oms.ts, with IANA support via Intl.
 */
import { z } from "zod";

export const DEFAULT_STORE_TIMEZONE = "America/Sao_Paulo";

export const salesPeriodSchema = z.enum(["today", "last_1h", "last_5min"]);
export type SalesPeriod = z.infer<typeof salesPeriodSchema>;

export const reportPeriodSchema = z.enum(["today", "7d", "30d"]);
export type ReportPeriod = z.infer<typeof reportPeriodSchema>;

const DAY_MS = 86_400_000;
const HOUR_MS = 3_600_000;

export function parseTimezoneOffsetMinutes(timezone: string): number | null {
  const match = timezone.match(/^([+-])(\d{2}):(\d{2})$/);
  if (!match) return null;
  const sign = match[1] === "+" ? 1 : -1;
  return (
    sign * (Number.parseInt(match[2], 10) * 60 + Number.parseInt(match[3], 10))
  );
}

/**
 * UTC offset (minutes) of a timezone at a given instant. Accepts "±HH:MM"
 * offsets or IANA names ("America/Sao_Paulo"). Falls back to 0 (UTC) for
 * unknown values instead of throwing.
 */
export function getOffsetMinutes(timezone: string, at = new Date()): number {
  const fixed = parseTimezoneOffsetMinutes(timezone);
  if (fixed !== null) return fixed;

  try {
    const parts = new Intl.DateTimeFormat("en-US", {
      timeZone: timezone,
      timeZoneName: "longOffset",
    }).formatToParts(at);
    const name = parts.find((part) => part.type === "timeZoneName")?.value;
    // "GMT-03:00", "GMT+05:30" or plain "GMT" for UTC.
    const match = name?.match(/^GMT(?:([+-])(\d{2}):(\d{2}))?$/);
    if (!match || !match[1]) return 0;
    const sign = match[1] === "+" ? 1 : -1;
    return (
      sign *
      (Number.parseInt(match[2], 10) * 60 + Number.parseInt(match[3], 10))
    );
  } catch {
    console.warn(
      `[Magento] Unknown timezone "${timezone}" — falling back to UTC.`,
    );
    return 0;
  }
}

/** Date → Magento UTC filter value ("YYYY-MM-DD HH:MM:SS"). */
export function toMagentoUtc(date: Date): string {
  return date.toISOString().slice(0, 19).replace("T", " ");
}

/** Magento UTC timestamp → epoch ms. Returns NaN for unparseable values. */
export function parseMagentoUtc(value: string): number {
  return Date.parse(`${value.replace(" ", "T")}Z`);
}

export interface TimeWindow {
  startUtc: Date;
  endUtc: Date;
  /** Local calendar date ("YYYY-MM-DD") when the window is day-aligned. */
  date?: string;
}

/** Start of the local calendar day through now. */
export function getTodayWindow(timezone: string, now = new Date()): TimeWindow {
  const offsetMinutes = getOffsetMinutes(timezone, now);
  const shifted = new Date(now.getTime() + offsetMinutes * 60_000);
  const year = shifted.getUTCFullYear();
  const month = shifted.getUTCMonth();
  const day = shifted.getUTCDate();
  const startMs = Date.UTC(year, month, day) - offsetMinutes * 60_000;

  return {
    startUtc: new Date(startMs),
    endUtc: now,
    date: `${year}-${String(month + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`,
  };
}

export function getRollingRange(minutes: number, now = new Date()): TimeWindow {
  return {
    startUtc: new Date(now.getTime() - minutes * 60_000),
    endUtc: now,
  };
}

/** "today" = local day so far; "7d"/"30d" = last N local days including today. */
export function getRangeForPeriod(
  period: ReportPeriod,
  timezone: string,
  now = new Date(),
): TimeWindow {
  const today = getTodayWindow(timezone, now);
  if (period === "today") return today;

  const days = period === "7d" ? 7 : 30;
  // A fixed 24h*N subtraction drifts by an hour across DST changes. Step to
  // midday of the target local day (safe against ±1h drift) and resolve that
  // day's true local midnight with the offset in effect at that instant.
  const targetMidday = new Date(
    today.startUtc.getTime() - (days - 1) * DAY_MS + 12 * HOUR_MS,
  );
  const targetDay = getTodayWindow(timezone, targetMidday);
  return {
    startUtc: targetDay.startUtc,
    endUtc: now,
    date: today.date,
  };
}

/** Local hour bucket (0-23) of a UTC instant relative to the local day start. */
export function getHourIndex(createdAtMs: number, dayStartMs: number): number {
  const index = Math.floor((createdAtMs - dayStartMs) / HOUR_MS);
  return Math.min(23, Math.max(0, index));
}
