import { describe, expect, test } from "bun:test";
import { buildOrdersTrendUrl } from "./orders-trend.ts";

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
      "https://lojausereserva.vtexcommercestable.com.br/api/analytics/consumption/home-orders-trend?",
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
