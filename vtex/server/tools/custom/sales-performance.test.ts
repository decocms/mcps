import { describe, expect, test } from "bun:test";
import {
  buildSalesPerformanceCardsUrl,
  buildSalesPerformanceTableUrl,
  buildSalesPerformanceTrendUrl,
  DEFAULT_SALES_PERFORMANCE_METRICS,
  mapMetricsToParams,
} from "./sales-performance.ts";

const dates = {
  startDate: "2026-08-11T03:00:00.000Z",
  endDate: "2026-08-18T02:59:59.000Z",
  compareStartDate: "2026-08-04T03:00:00.000Z",
  compareEndDate: "2026-08-11T02:59:59.000Z",
};

describe("mapMetricsToParams", () => {
  test("maps an ordered list to metric1..metricN", () => {
    expect(mapMetricsToParams(["capturedRevenue", "capturedOrders"])).toEqual({
      metric1: "capturedRevenue",
      metric2: "capturedOrders",
    });
  });
});

describe("buildSalesPerformanceCardsUrl", () => {
  test("matches admin dashboard query shape without encoded colons", () => {
    const url = buildSalesPerformanceCardsUrl("torratorra", {
      currency: "BRL",
      ...dates,
      metrics: DEFAULT_SALES_PERFORMANCE_METRICS,
    });

    expect(url).toBe(
      "https://torratorra.myvtex.com/api/analytics/consumption/sp-cards?an=torratorra&currency=BRL&startDate=2026-08-11T03:00:00.000Z&endDate=2026-08-18T02:59:59.000Z&compareStartDate=2026-08-04T03:00:00.000Z&compareEndDate=2026-08-11T02:59:59.000Z&metric1=capturedRevenue&metric2=capturedOrders&metric3=capturedAverageTicket&metric4=itemsPerOrder&metric5=averageSellingPrice",
    );
    expect(url).not.toContain("%3A");
  });
});

describe("buildSalesPerformanceTrendUrl", () => {
  test("includes single metric, agg and timezone", () => {
    const url = buildSalesPerformanceTrendUrl("torratorra", {
      currency: "BRL",
      metric: "capturedRevenue",
      agg: "day",
      timezone: "-03:00",
      ...dates,
    });

    expect(url).toBe(
      "https://torratorra.myvtex.com/api/analytics/consumption/sp-graphic?an=torratorra&currency=BRL&metric1=capturedRevenue&agg=day&timezone=-03:00&startDate=2026-08-11T03:00:00.000Z&endDate=2026-08-18T02:59:59.000Z&compareStartDate=2026-08-04T03:00:00.000Z&compareEndDate=2026-08-11T02:59:59.000Z",
    );
    expect(url).not.toContain("%3A");
  });
});

describe("buildSalesPerformanceTableUrl", () => {
  test("matches the shared endpoint query shape", () => {
    const url = buildSalesPerformanceTableUrl("torratorra", {
      currency: "BRL",
      groupBy: "productName",
      metrics: DEFAULT_SALES_PERFORMANCE_METRICS,
      sortBy: "capturedRevenue",
      sortOrientation: "DESC",
      sortType: "percentage",
      itemsPerPage: 10,
      startIndex: 0,
      ...dates,
    });

    expect(url).toBe(
      "https://torratorra.myvtex.com/api/analytics/consumption/sp-item-detail-table?an=torratorra&currency=BRL&sortBy=capturedRevenue&sortOrientation=DESC&sortType=percentage&itemsPerPage=10&groupByDim=productName&startDate=2026-08-11T03:00:00.000Z&endDate=2026-08-18T02:59:59.000Z&compareStartDate=2026-08-04T03:00:00.000Z&compareEndDate=2026-08-11T02:59:59.000Z&metric1=capturedRevenue&metric2=capturedOrders&metric3=capturedAverageTicket&metric4=itemsPerOrder&metric5=averageSellingPrice&startIndex=0",
    );
    expect(url).not.toContain("%3A");
  });
});
