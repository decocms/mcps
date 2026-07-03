import { afterEach, describe, expect, test } from "bun:test";
import {
  aggregateByStatus,
  aggregateHourlyBuckets,
  aggregateTopProducts,
  aggregateWindowStats,
  countOrders,
  searchOrders,
  type MagentoOrderSummary,
} from "./orders-search.ts";
import type { MagentoCredentials } from "../../lib/client.ts";

const CREDS: MagentoCredentials = {
  baseUrl: "https://example.com",
  apiToken: "token",
  storeCode: "granado",
};

const DAY_START = Date.parse("2026-07-03T03:00:00Z"); // local midnight SP

function order(
  createdAtUtc: string,
  grandTotal: number,
  status = "processing",
  items?: MagentoOrderSummary["items"],
): MagentoOrderSummary {
  return {
    increment_id: "000000001",
    status,
    grand_total: grandTotal,
    created_at: createdAtUtc,
    ...(items ? { items } : {}),
  };
}

const originalFetch = globalThis.fetch;

afterEach(() => {
  globalThis.fetch = originalFetch;
});

function mockFetchPages(
  pages: Array<{ items: unknown[]; total_count: number }>,
) {
  const urls: string[] = [];
  let call = 0;
  globalThis.fetch = ((input: RequestInfo | URL) => {
    urls.push(String(input));
    const page = pages[Math.min(call, pages.length - 1)];
    call++;
    return Promise.resolve(
      new Response(JSON.stringify(page), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }),
    );
  }) as typeof fetch;
  return urls;
}

describe("searchOrders", () => {
  test("paginates until total_count is reached", async () => {
    const items = Array.from({ length: 3 }, (_, i) =>
      order("2026-07-03 10:00:0" + i, 100),
    );
    const urls = mockFetchPages([
      { items: items.slice(0, 2), total_count: 3 },
      { items: items.slice(2), total_count: 3 },
    ]);

    const result = await searchOrders({
      creds: CREDS,
      window: {
        startUtc: new Date("2026-07-03T03:00:00Z"),
        endUtc: new Date("2026-07-03T13:00:00Z"),
      },
      pageSize: 2,
    });

    expect(result.items.length).toBe(3);
    expect(result.totalCount).toBe(3);
    expect(result.truncated).toBe(false);
    expect(urls.length).toBe(2);
    expect(urls[0]).toContain("/rest/granado/V1/orders?");
    expect(urls[0]).toContain(
      encodeURIComponent("searchCriteria[currentPage]"),
    );
    // created_at range filters present (URL-encoded brackets and space).
    expect(decodeURIComponent(urls[0])).toContain(
      "searchCriteria[filter_groups][0][filters][0][field]=created_at",
    );
  });

  test("flags truncation when maxPages is hit", async () => {
    mockFetchPages([
      { items: [order("2026-07-03 10:00:00", 100)], total_count: 10 },
    ]);

    const result = await searchOrders({
      creds: CREDS,
      window: {
        startUtc: new Date("2026-07-03T03:00:00Z"),
        endUtc: new Date("2026-07-03T13:00:00Z"),
      },
      pageSize: 1,
      maxPages: 2,
    });

    expect(result.items.length).toBe(2);
    expect(result.totalCount).toBe(10);
    expect(result.truncated).toBe(true);
  });
});

describe("countOrders", () => {
  test("uses pageSize=1 + total_count fields", async () => {
    const urls = mockFetchPages([{ items: [], total_count: 42 }]);
    const count = await countOrders(CREDS, [
      { field: "status", value: "canceled", conditionType: "eq" },
    ]);
    expect(count).toBe(42);
    const url = decodeURIComponent(urls[0]);
    expect(url).toContain("searchCriteria[pageSize]=1");
    expect(url).toContain("fields=total_count");
  });
});

describe("aggregateHourlyBuckets", () => {
  test("zero-fills 24 buckets and sums per local hour", () => {
    const buckets = aggregateHourlyBuckets(
      [
        order("2026-07-03 03:10:00", 100), // 00:00 local
        order("2026-07-03 13:30:00", 50), // 10:00 local
        order("2026-07-03 13:45:00", 25), // 10:00 local
      ],
      DAY_START,
    );
    expect(buckets.length).toBe(24);
    expect(buckets[0]).toEqual({ hour: "00:00", count: 1, totalValue: 100 });
    expect(buckets[10]).toEqual({ hour: "10:00", count: 2, totalValue: 75 });
    expect(buckets[23]).toEqual({ hour: "23:00", count: 0, totalValue: 0 });
  });
});

describe("aggregateWindowStats", () => {
  test("only counts orders at or after startMs", () => {
    const stats = aggregateWindowStats(
      [
        order("2026-07-03 10:00:00", 100),
        order("2026-07-03 12:59:00", 50),
        order("2026-07-03 12:30:00", 25),
      ],
      Date.parse("2026-07-03T12:00:00Z"),
    );
    expect(stats.orders).toBe(2);
    expect(stats.totalValue).toBe(75);
  });
});

describe("aggregateByStatus", () => {
  test("groups and sorts by count desc", () => {
    const statuses = aggregateByStatus([
      order("2026-07-03 10:00:00", 100, "processing"),
      order("2026-07-03 10:01:00", 50, "processing"),
      order("2026-07-03 10:02:00", 30, "canceled"),
    ]);
    expect(statuses[0]).toEqual({
      status: "processing",
      count: 2,
      totalValue: 150,
    });
    expect(statuses[1]).toEqual({
      status: "canceled",
      count: 1,
      totalValue: 30,
    });
  });
});

describe("aggregateTopProducts", () => {
  test("aggregates top-level items by sku, skipping configurable children", () => {
    const products = aggregateTopProducts(
      [
        order("2026-07-03 10:00:00", 100, "processing", [
          { sku: "SAB-01", name: "Sabonete", qty_ordered: 2, row_total: 40 },
          {
            sku: "SAB-01-CHILD",
            name: "Sabonete P",
            qty_ordered: 2,
            row_total: 0,
            parent_item_id: 99,
          },
        ]),
        order("2026-07-03 11:00:00", 60, "processing", [
          { sku: "SAB-01", name: "Sabonete", qty_ordered: 1, row_total: 20 },
          { sku: "COL-02", name: "Colônia", qty_ordered: 1, row_total: 90 },
        ]),
      ],
      10,
    );

    expect(products[0]).toEqual({
      sku: "SAB-01",
      name: "Sabonete",
      quantity: 3,
      revenue: 60,
      orders: 2,
    });
    expect(products.find((p) => p.sku === "SAB-01-CHILD")).toBeUndefined();
  });

  test("counts distinct orders even when a SKU repeats within one order", () => {
    const products = aggregateTopProducts(
      [
        order("2026-07-03 10:00:00", 100, "processing", [
          { sku: "SAB-01", name: "Sabonete", qty_ordered: 1, row_total: 20 },
          { sku: "SAB-01", name: "Sabonete", qty_ordered: 2, row_total: 40 },
        ]),
      ],
      10,
    );
    expect(products[0]).toEqual({
      sku: "SAB-01",
      name: "Sabonete",
      quantity: 3,
      revenue: 60,
      orders: 1,
    });
  });

  test("respects the limit", () => {
    const products = aggregateTopProducts(
      [
        order("2026-07-03 10:00:00", 100, "processing", [
          { sku: "A", name: "A", qty_ordered: 3, row_total: 30 },
          { sku: "B", name: "B", qty_ordered: 2, row_total: 20 },
          { sku: "C", name: "C", qty_ordered: 1, row_total: 10 },
        ]),
      ],
      2,
    );
    expect(products.length).toBe(2);
    expect(products.map((p) => p.sku)).toEqual(["A", "B"]);
  });
});
