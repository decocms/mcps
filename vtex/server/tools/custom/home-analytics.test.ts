import { describe, expect, test } from "bun:test";
import {
  buildHomeMetricsSummaryUrl,
  buildHomeTopProductsUrl,
  buildHomeTopViewedProductsUrl,
  resolveTopViewedProductsParams,
} from "./home-analytics.ts";
import { resolveAnalyticsDateRange } from "./orders-oms.ts";

const now = new Date("2026-06-23T17:49:00.000Z");
const timezone = "-03:00";

describe("resolveAnalyticsDateRange", () => {
  test("defaults to today with previous-day compare window", () => {
    const range = resolveAnalyticsDateRange({ timezone, now });

    expect(range.startDate).toBe("2026-06-23T03:00:00.000Z");
    expect(range.endDate).toBe("2026-06-23T17:49:00.000Z");
    expect(range.compareStartDate).toBe("2026-06-22T03:00:00.000Z");
    expect(range.compareEndDate).toBe("2026-06-22T17:49:00.000Z");
  });
});

describe("buildHomeMetricsSummaryUrl", () => {
  test("matches admin dashboard query shape without encoded colons", () => {
    const url = buildHomeMetricsSummaryUrl("lojafarm", {
      currency: "BRL",
      agg: "hour",
      startDate: "2026-06-23T03:00:00.000Z",
      endDate: "2026-06-23T17:49:00.000Z",
      compareStartDate: "2026-06-22T03:00:00.000Z",
      compareEndDate: "2026-06-22T17:49:00.000Z",
    });

    expect(url).toBe(
      "https://lojafarm.myvtex.com/api/analytics/consumption/home-metrics-summary-v2?an=lojafarm&currency=BRL&agg=hour&startDate=2026-06-23T03:00:00.000Z&endDate=2026-06-23T17:49:00.000Z&compareStartDate=2026-06-22T03:00:00.000Z&compareEndDate=2026-06-22T17:49:00.000Z",
    );
    expect(url).not.toContain("%3A");
  });
});

describe("buildHomeTopViewedProductsUrl", () => {
  test("matches admin dashboard query shape", () => {
    const url = buildHomeTopViewedProductsUrl("lojafarm", {
      startDate: "2026-06-23T03:00:00.000Z",
      endDate: "2026-06-23T17:49:00.000Z",
      size: 100,
    });

    expect(url).toBe(
      "https://lojafarm.myvtex.com/api/analytics/consumption/home-top-viewed-products?startDate=2026-06-23T03:00:00.000Z&endDate=2026-06-23T17:49:00.000Z&an=lojafarm&size=100",
    );
  });
});

describe("buildHomeTopProductsUrl", () => {
  test("matches admin dashboard query shape", () => {
    const url = buildHomeTopProductsUrl("lojafarm", {
      currency: "BRL",
      startDate: "2026-06-23T03:00:00.000Z",
      endDate: "2026-06-23T17:49:00.000Z",
      compareStartDate: "2026-06-22T03:00:00.000Z",
      compareEndDate: "2026-06-22T17:49:00.000Z",
      sort: "REVENUESort",
      sort_ref: "REVENUERef",
    });

    expect(url).toBe(
      "https://lojafarm.myvtex.com/api/analytics/consumption/home-top-products-v2?an=lojafarm&currency=BRL&startDate=2026-06-23T03:00:00.000Z&endDate=2026-06-23T17:49:00.000Z&compareStartDate=2026-06-22T03:00:00.000Z&compareEndDate=2026-06-22T17:49:00.000Z&sort=REVENUESort&sort_ref=REVENUERef",
    );
  });
});

describe("resolveTopViewedProductsParams", () => {
  test("defaults size and date window", () => {
    const params = resolveTopViewedProductsParams({
      size: 100,
      timezone,
      now,
    });

    expect(params).toEqual({
      startDate: "2026-06-23T03:00:00.000Z",
      endDate: "2026-06-23T17:49:00.000Z",
      size: 100,
    });
  });
});
