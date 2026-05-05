import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import {
  type FetchCall,
  jsonResponse,
  makeEnv,
  makeRuntimeContext,
  mockFetch,
  v2State,
} from "./__test-helpers.ts";
import { getTrafficTool } from "./get-traffic.ts";

const realFetch = globalThis.fetch;

beforeEach(() => {
  globalThis.fetch = realFetch;
  delete process.env.CRAZY_EGG_API_KEY;
  delete process.env.CRAZY_EGG_APP_KEY;
});
afterEach(() => {
  globalThis.fetch = realFetch;
});

describe("getTrafficTool", () => {
  test("has expected metadata", () => {
    const tool = getTrafficTool(makeEnv());
    expect(tool.id).toBe("crazy_egg_get_traffic");
  });

  test("aggregates total visits and clicks from all snapshots", async () => {
    const snapshots = [
      { id: "1", name: "Home", total_visits: 1000, total_clicks: 250 },
      { id: "2", name: "PDP", total_visits: 500, total_clicks: 125 },
      { id: "3", name: "Checkout", total_visits: 100, total_clicks: 50 },
    ];
    const calls: FetchCall[] = [];
    mockFetch(calls, jsonResponse(snapshots));

    const tool = getTrafficTool(makeEnv());
    const result = await tool.execute({
      context: {},
      runtimeContext: makeRuntimeContext(v2State()),
    });

    expect(result.totalVisits).toBe(1600);
    expect(result.totalClicks).toBe(425);
    expect(result.bySnapshot).toHaveLength(3);
    expect(result.bySnapshot[0]).toMatchObject({
      id: "1",
      name: "Home",
      visits: 1000,
      clicks: 250,
    });
  });

  test("computes click-through rate per snapshot", async () => {
    const calls: FetchCall[] = [];
    mockFetch(
      calls,
      jsonResponse([
        { id: "1", total_visits: 1000, total_clicks: 250 },
        { id: "2", total_visits: 0, total_clicks: 0 },
      ]),
    );

    const tool = getTrafficTool(makeEnv());
    const result = await tool.execute({
      context: {},
      runtimeContext: makeRuntimeContext(v2State()),
    });

    expect(result.bySnapshot[0].clickThroughRate).toBe(0.25);
    // Avoid division by zero
    expect(result.bySnapshot[1].clickThroughRate).toBe(0);
  });

  test("handles missing total_visits/total_clicks fields by defaulting to 0", async () => {
    const calls: FetchCall[] = [];
    mockFetch(calls, jsonResponse([{ id: "1", name: "X" }, { id: "2" }]));

    const tool = getTrafficTool(makeEnv());
    const result = await tool.execute({
      context: {},
      runtimeContext: makeRuntimeContext(v2State()),
    });

    expect(result.totalVisits).toBe(0);
    expect(result.totalClicks).toBe(0);
  });
});
