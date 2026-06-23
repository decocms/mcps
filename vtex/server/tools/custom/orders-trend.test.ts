import { describe, expect, test } from "bun:test";
import {
  buildOrdersTrendUrl,
  extractOrdersTrendChartPoints,
  hasUsableTrendChartData,
  hourLabelInTimezone,
  parseAnalyticsHourlyBuckets,
  resolveOrdersTrendParams,
} from "./orders-trend.ts";

describe("buildOrdersTrendUrl", () => {
  const params = {
    startDate: "2026-06-23T00:00:00.000Z",
    endDate: "2026-06-23T23:59:00.000Z",
    agg: "hour",
    currency: "BRL",
    timezone: "-03:00",
  };

  test("targets the internal analytics consumption endpoint", () => {
    const url = buildOrdersTrendUrl("lojausereserva", params);
    expect(url).toContain(
      "https://lojausereserva.myvtex.com/api/analytics/consumption/home-orders-trend?",
    );
  });

  test("includes all query params with literal colons", () => {
    const url = buildOrdersTrendUrl("lojausereserva", params);
    expect(url).toContain("startDate=2026-06-23T00:00:00.000Z");
    expect(url).toContain("endDate=2026-06-23T23:59:00.000Z");
    expect(url).toContain("timezone=-03:00");
    expect(url).not.toContain("%3A");

    const parsed = new URL(url);
    expect(parsed.searchParams.get("an")).toBe("lojausereserva");
    expect(parsed.searchParams.get("currency")).toBe("BRL");
    expect(parsed.searchParams.get("startDate")).toBe(params.startDate);
    expect(parsed.searchParams.get("endDate")).toBe(params.endDate);
    expect(parsed.searchParams.get("agg")).toBe("hour");
    expect(parsed.searchParams.get("timezone")).toBe("-03:00");
  });
});

describe("resolveOrdersTrendParams", () => {
  test("defaults start/end to local midnight through now", () => {
    const now = new Date("2026-06-23T17:49:00.000Z");
    const params = resolveOrdersTrendParams({
      agg: "hour",
      currency: "BRL",
      timezone: "-03:00",
      now,
    });

    expect(params.startDate).toBe("2026-06-23T03:00:00.000Z");
    expect(params.endDate).toBe("2026-06-23T17:49:00.000Z");
    expect(params.agg).toBe("hour");
    expect(params.currency).toBe("BRL");
    expect(params.timezone).toBe("-03:00");
  });

  test("truncates sub-second precision on default endDate", () => {
    const now = new Date("2026-06-23T17:56:22.176Z");
    const params = resolveOrdersTrendParams({
      agg: "hour",
      currency: "BRL",
      timezone: "-03:00",
      now,
    });

    expect(params.endDate).toBe("2026-06-23T17:56:22.000Z");
  });

  test("keeps explicit start/end when provided", () => {
    const params = resolveOrdersTrendParams({
      startDate: "2026-06-01T00:00:00.000Z",
      endDate: "2026-06-01T23:59:00.000Z",
      agg: "day",
      currency: "BRL",
      timezone: "-03:00",
    });

    expect(params.startDate).toBe("2026-06-01T00:00:00.000Z");
    expect(params.endDate).toBe("2026-06-01T23:59:00.000Z");
    expect(params.agg).toBe("day");
  });
});

describe("hourLabelInTimezone", () => {
  test("maps UTC bucket timestamps to local hour labels", () => {
    expect(hourLabelInTimezone("2026-06-23T14:00:00.000Z", "-03:00")).toBe(
      "11:00",
    );
    expect(hourLabelInTimezone("2026-06-23T03:00:00.000Z", "-03:00")).toBe(
      "00:00",
    );
  });
});

describe("parseAnalyticsHourlyBuckets", () => {
  test("maps dataChart points into 24 local hour buckets", () => {
    const hours = parseAnalyticsHourlyBuckets(
      {
        dataChart: [
          {
            date: "2026-06-23T14:00:00.000Z",
            orders: 120,
          },
          {
            date: null,
            orders: null,
          },
        ],
      },
      "-03:00",
    );

    expect(hours).toHaveLength(24);
    expect(hours[11]).toEqual({
      hour: "11:00",
      count: 120,
      totalValue: 0,
    });
    expect(hours[0]?.count).toBe(0);
  });

  test("accepts a top-level chart array", () => {
    const hours = parseAnalyticsHourlyBuckets(
      [
        {
          date: "2026-06-23T14:00:00.000Z",
          orders: 42,
        },
      ],
      "-03:00",
    );

    expect(hours[11]?.count).toBe(42);
  });

  test("accepts null dataChart as empty", () => {
    const hours = parseAnalyticsHourlyBuckets({ dataChart: null }, "-03:00");
    expect(hours.every((bucket) => bucket.count === 0)).toBe(true);
  });

  test("accepts VTEX ordersTrendData wrapper", () => {
    const hours = parseAnalyticsHourlyBuckets(
      {
        ordersTrendData: {
          dataChart: [
            {
              date: "2026-06-23T14:00:00.000Z",
              orders: 99,
            },
          ],
        },
      },
      "-03:00",
    );

    expect(hours[11]?.count).toBe(99);
  });

  test("accepts stringified JSON payloads", () => {
    const hours = parseAnalyticsHourlyBuckets(
      JSON.stringify({
        dataChart: [
          {
            date: "2026-06-23T03:00:00.000Z",
            orders: "7",
          },
        ],
      }),
      "-03:00",
    );

    expect(hours[0]?.count).toBe(7);
  });
});

describe("hasUsableTrendChartData", () => {
  test("returns false for null placeholder buckets", () => {
    expect(
      hasUsableTrendChartData({
        ordersTrendData: {
          dataChart: [
            {
              date: null,
              orders: null,
              status: "NORMAL",
            },
          ],
        },
      }),
    ).toBe(false);
  });

  test("returns true when at least one bucket has data", () => {
    expect(
      hasUsableTrendChartData({
        dataChart: [{ date: "2026-06-23T14:00:00.000Z", orders: 5 }],
      }),
    ).toBe(true);
  });
});

describe("extractOrdersTrendChartPoints", () => {
  test("throws a descriptive error for unknown payloads", () => {
    expect(() => extractOrdersTrendChartPoints({})).toThrow(
      /Invalid VTEX orders trend response: object\(keys=none\)/,
    );
  });
});
