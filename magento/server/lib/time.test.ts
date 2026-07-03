import { describe, expect, test } from "bun:test";
import {
  getHourIndex,
  getOffsetMinutes,
  getRangeForPeriod,
  getRollingRange,
  getTodayWindow,
  parseMagentoUtc,
  toMagentoUtc,
} from "./time.ts";

describe("getOffsetMinutes", () => {
  test("parses fixed ±HH:MM offsets", () => {
    expect(getOffsetMinutes("-03:00")).toBe(-180);
    expect(getOffsetMinutes("+05:30")).toBe(330);
  });

  test("resolves IANA names via Intl", () => {
    // Brazil abolished DST in 2019 — São Paulo is always -03:00.
    expect(
      getOffsetMinutes("America/Sao_Paulo", new Date("2026-07-03T12:00:00Z")),
    ).toBe(-180);
    expect(
      getOffsetMinutes("America/Sao_Paulo", new Date("2026-01-15T12:00:00Z")),
    ).toBe(-180);
    expect(getOffsetMinutes("UTC")).toBe(0);
  });

  test("falls back to UTC for unknown timezones", () => {
    expect(getOffsetMinutes("Not/AZone")).toBe(0);
  });
});

describe("magento UTC format", () => {
  test("toMagentoUtc emits MySQL format", () => {
    expect(toMagentoUtc(new Date("2026-07-03T14:22:11.500Z"))).toBe(
      "2026-07-03 14:22:11",
    );
  });

  test("parseMagentoUtc round-trips", () => {
    const ms = parseMagentoUtc("2026-07-03 14:22:11");
    expect(ms).toBe(Date.parse("2026-07-03T14:22:11Z"));
  });

  test("parseMagentoUtc returns NaN for garbage", () => {
    expect(Number.isNaN(parseMagentoUtc("not-a-date"))).toBe(true);
  });
});

describe("getTodayWindow", () => {
  test("day start is local midnight converted to UTC", () => {
    // 2026-07-03 10:00 in São Paulo == 13:00 UTC.
    const now = new Date("2026-07-03T13:00:00Z");
    const window = getTodayWindow("America/Sao_Paulo", now);
    expect(window.startUtc.toISOString()).toBe("2026-07-03T03:00:00.000Z");
    expect(window.endUtc.toISOString()).toBe(now.toISOString());
    expect(window.date).toBe("2026-07-03");
  });

  test("just after local midnight, today is nearly empty", () => {
    // 00:10 local on Jul 4 == 03:10 UTC Jul 4.
    const now = new Date("2026-07-04T03:10:00Z");
    const window = getTodayWindow("America/Sao_Paulo", now);
    expect(window.startUtc.toISOString()).toBe("2026-07-04T03:00:00.000Z");
    expect(window.date).toBe("2026-07-04");
  });

  test("just before local midnight, date stays on the local day", () => {
    // 23:59 local on Jul 3 == 02:59 UTC Jul 4.
    const now = new Date("2026-07-04T02:59:00Z");
    const window = getTodayWindow("America/Sao_Paulo", now);
    expect(window.startUtc.toISOString()).toBe("2026-07-03T03:00:00.000Z");
    expect(window.date).toBe("2026-07-03");
  });
});

describe("getRangeForPeriod", () => {
  const now = new Date("2026-07-03T13:00:00Z");

  test("today delegates to getTodayWindow", () => {
    const window = getRangeForPeriod("today", "America/Sao_Paulo", now);
    expect(window.startUtc.toISOString()).toBe("2026-07-03T03:00:00.000Z");
  });

  test("7d includes today plus six prior local days", () => {
    const window = getRangeForPeriod("7d", "America/Sao_Paulo", now);
    expect(window.startUtc.toISOString()).toBe("2026-06-27T03:00:00.000Z");
    expect(window.endUtc.toISOString()).toBe(now.toISOString());
  });

  test("30d includes today plus 29 prior local days", () => {
    const window = getRangeForPeriod("30d", "America/Sao_Paulo", now);
    expect(window.startUtc.toISOString()).toBe("2026-06-04T03:00:00.000Z");
  });
});

describe("getRollingRange", () => {
  test("returns now minus N minutes", () => {
    const now = new Date("2026-07-03T13:00:00Z");
    const range = getRollingRange(60, now);
    expect(range.startUtc.toISOString()).toBe("2026-07-03T12:00:00.000Z");
    expect(range.endUtc.toISOString()).toBe(now.toISOString());
  });
});

describe("getHourIndex", () => {
  const dayStart = Date.parse("2026-07-03T03:00:00Z"); // local midnight SP

  test("buckets by local hour", () => {
    expect(getHourIndex(Date.parse("2026-07-03T03:10:00Z"), dayStart)).toBe(0);
    expect(getHourIndex(Date.parse("2026-07-03T13:59:00Z"), dayStart)).toBe(10);
  });

  test("clamps out-of-day values into 0..23", () => {
    expect(getHourIndex(dayStart - 1, dayStart)).toBe(0);
    expect(getHourIndex(dayStart + 25 * 3_600_000, dayStart)).toBe(23);
  });
});
