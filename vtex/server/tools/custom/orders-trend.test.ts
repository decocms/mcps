import { describe, expect, test } from "bun:test";
import {
  buildOrdersTrendUrl,
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
