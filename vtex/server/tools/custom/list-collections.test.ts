import { describe, expect, test } from "bun:test";
import {
  type CollectionSearchPage,
  collectAllCollections,
} from "./list-collections.ts";

function pagedFetcher(all: Record<string, unknown>[]) {
  const calls: number[] = [];
  const fetchPage = (
    page: number,
    pageSize: number,
  ): Promise<CollectionSearchPage> => {
    calls.push(page);
    const start = (page - 1) * pageSize;
    return Promise.resolve({
      items: all.slice(start, start + pageSize),
      paging: { total: all.length },
    });
  };
  return { fetchPage, calls };
}

describe("collectAllCollections", () => {
  test("accumulates every collection across pages", async () => {
    const all = Array.from({ length: 5 }, (_, i) => ({ id: i + 1 }));
    const { fetchPage, calls } = pagedFetcher(all);

    const result = await collectAllCollections(fetchPage, 2);

    expect(result.total).toBe(5);
    expect(result.items).toEqual(all);
    // pages 1,2,3 — third page is short, so it stops there.
    expect(calls).toEqual([1, 2, 3]);
  });

  test("stops after a single full page when total is reached", async () => {
    const all = Array.from({ length: 4 }, (_, i) => ({ id: i + 1 }));
    const { fetchPage, calls } = pagedFetcher(all);

    const result = await collectAllCollections(fetchPage, 4);

    expect(result.items).toHaveLength(4);
    expect(calls).toEqual([1]);
  });

  test("returns empty result when there are no collections", async () => {
    const { fetchPage, calls } = pagedFetcher([]);

    const result = await collectAllCollections(fetchPage, 50);

    expect(result).toEqual({ items: [], total: 0 });
    expect(calls).toEqual([1]);
  });

  test("falls back to collected count when paging.total is absent", async () => {
    const fetchPage = (): Promise<CollectionSearchPage> =>
      Promise.resolve({ items: [{ id: 1 }] });

    const result = await collectAllCollections(fetchPage, 50);

    // Short page (1 < 50) stops pagination; total defaults to items collected.
    expect(result).toEqual({ items: [{ id: 1 }], total: 1 });
  });
});
