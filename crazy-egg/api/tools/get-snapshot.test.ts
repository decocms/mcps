import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import {
  type FetchCall,
  jsonResponse,
  makeEnv,
  makeRuntimeContext,
  mockFetch,
  v2State,
} from "./__test-helpers.ts";
import { getSnapshotTool } from "./get-snapshot.ts";

const realFetch = globalThis.fetch;

beforeEach(() => {
  globalThis.fetch = realFetch;
  delete process.env.CRAZY_EGG_API_KEY;
  delete process.env.CRAZY_EGG_APP_KEY;
});
afterEach(() => {
  globalThis.fetch = realFetch;
});

describe("getSnapshotTool", () => {
  test("has expected metadata", () => {
    const tool = getSnapshotTool(makeEnv());
    expect(tool.id).toBe("crazy_egg_get_snapshot");
    expect(tool._meta).toMatchObject({
      ui: { resourceUri: "ui://crazy-egg/dashboard" },
    });
  });

  test("hits /snapshots/{id}.json signed", async () => {
    const calls: FetchCall[] = [];
    mockFetch(
      calls,
      jsonResponse({
        id: "snap-7",
        name: "Detail",
        heatmap_url: "https://heatmap.example.com",
      }),
    );

    const tool = getSnapshotTool(makeEnv());
    const result = await tool.execute({
      context: { snapshotId: "snap-7" },
      runtimeContext: makeRuntimeContext(v2State()),
    });

    expect(calls[0].url).toMatch(
      /^https:\/\/app\.crazyegg\.com\/api\/v2\/snapshots\/snap-7\.json\?/,
    );
    expect(result.snapshot.id).toBe("snap-7");
  });

  test("rejects empty snapshotId at input validation", async () => {
    const tool = getSnapshotTool(makeEnv());
    // Zod validation happens at runtime via the runtime, but we can check the schema
    expect(() => tool.inputSchema.parse({ snapshotId: "" })).toThrow();
  });
});
