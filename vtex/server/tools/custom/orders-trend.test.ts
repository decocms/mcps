import { describe, expect, test } from "bun:test";
import {
  buildOrdersTrendUrl,
  formatAnalyticsEndDate,
  normalizeAnalyticsParams,
} from "./orders-trend.ts";

describe("buildOrdersTrendUrl", () => {
  const params = {
    startDate: "2026-06-23T03:00:00.000Z",
    endDate: "2026-06-23T16:35:00.000Z",
    agg: "hour",
    currency: "BRL",
    timezone: "-03:00",
  };

  test("targets the internal analytics consumption endpoint on myvtex.com", () => {
    const url = buildOrdersTrendUrl("lojausereserva", params);
    expect(url).toContain(
      "https://lojausereserva.myvtex.com/api/analytics/consumption/home-orders-trend?",
    );
  });

  test("includes all query params, url-encoded", () => {
    const url = new URL(buildOrdersTrendUrl("lojausereserva", params));
    expect(url.searchParams.get("an")).toBe("lojausereserva");
    expect(url.searchParams.get("currency")).toBe("BRL");
    expect(url.searchParams.get("startDate")).toBe(params.startDate);
    expect(url.searchParams.get("endDate")).toBe(params.endDate);
    expect(url.searchParams.get("agg")).toBe("hour");
    expect(url.searchParams.get("timezone")).toBe("-03:00");
  });
});

describe("normalizeAnalyticsParams", () => {
  const base = {
    startDate: "2026-06-23T03:00:00.000Z",
    agg: "hour" as const,
    currency: "BRL",
    timezone: "-03:00",
  };

  test("clamps future end-of-day to now", () => {
    const normalized = normalizeAnalyticsParams({
      ...base,
      endDate: "2026-06-24T02:59:59.999Z",
    });

    expect(normalized.endDate.endsWith(":00.000Z")).toBe(true);
    expect(new Date(normalized.endDate).getTime()).toBeLessThanOrEqual(
      Date.now(),
    );
  });
});

describe("formatAnalyticsEndDate", () => {
  test("zeroes seconds and milliseconds", () => {
    expect(formatAnalyticsEndDate(new Date("2026-06-23T16:35:42.987Z"))).toBe(
      "2026-06-23T16:35:00.000Z",
    );
  });
});
