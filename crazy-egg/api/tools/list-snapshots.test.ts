import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import {
  type FetchCall,
  jsonResponse,
  makeEnv,
  makeRuntimeContext,
  mockFetch,
  v2State,
} from "./__test-helpers.ts";
import { listSnapshotsTool } from "./list-snapshots.ts";

const realFetch = globalThis.fetch;

beforeEach(() => {
  globalThis.fetch = realFetch;
  delete process.env.CRAZY_EGG_API_KEY;
  delete process.env.CRAZY_EGG_APP_KEY;
});
afterEach(() => {
  globalThis.fetch = realFetch;
});

describe("listSnapshotsTool", () => {
  test("has expected metadata and unstable warning", () => {
    const tool = listSnapshotsTool(makeEnv());
    expect(tool.id).toBe("crazy_egg_list_snapshots");
    expect(tool.description).toMatch(/undocumented|unstable|legacy/i);
    expect(tool._meta).toMatchObject({
      ui: { resourceUri: "ui://crazy-egg/dashboard" },
    });
  });

  test("returns snapshots and supports limit/filter clientside", async () => {
    const snapshots = [
      {
        id: "abc",
        name: "Homepage",
        source_url: "https://example.com",
        thumbnail_url: "https://t",
        heatmap_url: "https://h",
        screenshot_url: "https://s",
        total_visits: 100,
        total_clicks: 25,
        status: "active",
      },
      {
        id: "def",
        name: "PDP",
        source_url: "https://example.com/p/1",
        total_visits: 50,
        total_clicks: 10,
        status: "active",
      },
    ];

    const calls: FetchCall[] = [];
    mockFetch(calls, jsonResponse(snapshots));

    const tool = listSnapshotsTool(makeEnv());
    const result = await tool.execute({
      context: {},
      runtimeContext: makeRuntimeContext(v2State()),
    });

    expect(calls[0].url).toMatch(
      /^https:\/\/app\.crazyegg\.com\/api\/v2\/snapshots\.json\?/,
    );
    expect(result.snapshots).toHaveLength(2);
    expect(result.total).toBe(2);
  });

  test("respects limit parameter", async () => {
    const snapshots = Array.from({ length: 5 }, (_, i) => ({
      id: `snap-${i}`,
      name: `Snap ${i}`,
    }));
    const calls: FetchCall[] = [];
    mockFetch(calls, jsonResponse(snapshots));

    const tool = listSnapshotsTool(makeEnv());
    const result = await tool.execute({
      context: { limit: 2 },
      runtimeContext: makeRuntimeContext(v2State()),
    });

    expect(result.snapshots).toHaveLength(2);
    expect(result.total).toBe(5);
  });

  test("filters by status when filter provided", async () => {
    const snapshots = [
      { id: "1", status: "active" },
      { id: "2", status: "paused" },
      { id: "3", status: "active" },
    ];
    const calls: FetchCall[] = [];
    mockFetch(calls, jsonResponse(snapshots));

    const tool = listSnapshotsTool(makeEnv());
    const result = await tool.execute({
      context: { status: "active" },
      runtimeContext: makeRuntimeContext(v2State()),
    });

    expect(result.snapshots).toHaveLength(2);
    expect(result.snapshots.every((s) => s.status === "active")).toBe(true);
  });
});
