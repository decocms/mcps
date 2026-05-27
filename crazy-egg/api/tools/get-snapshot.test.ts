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
    expect(tool._meta).toBeUndefined();
  });

  test("finds snapshot by ID from list endpoint", async () => {
    const calls: FetchCall[] = [];
    mockFetch(
      calls,
      jsonResponse([
        { id: 7, name: "Detail", heatmap_url: "https://heatmap.example.com" },
        { id: 8, name: "Other" },
      ]),
    );

    const tool = getSnapshotTool(makeEnv());
    const result = await tool.execute({
      context: { snapshotId: "7" },
      runtimeContext: makeRuntimeContext(v2State()),
    });

    expect(calls[0].url).toMatch(
      /^https:\/\/app\.crazyegg\.com\/api\/v2\/snapshots\.json\?/,
    );
    expect(result.snapshot.id).toBe("7");
    expect(result.snapshot.name).toBe("Detail");
  });

  test("throws when snapshot ID is not found", async () => {
    const calls: FetchCall[] = [];
    mockFetch(calls, jsonResponse([{ id: 1, name: "Only" }]));

    const tool = getSnapshotTool(makeEnv());
    await expect(
      tool.execute({
        context: { snapshotId: "999" },
        runtimeContext: makeRuntimeContext(v2State()),
      }),
    ).rejects.toThrow(/not found/);
  });

  test("rejects empty snapshotId at input validation", async () => {
    const tool = getSnapshotTool(makeEnv());
    // Zod validation happens at runtime via the runtime, but we can check the schema
    expect(() => tool.inputSchema.parse({ snapshotId: "" })).toThrow();
  });
});
