import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import {
  type FetchCall,
  jsonResponse,
  makeEnv,
  makeRuntimeContext,
  mockFetch,
  v2State,
} from "./__test-helpers.ts";
import { listRecordingsTool } from "./list-recordings.ts";

const realFetch = globalThis.fetch;

beforeEach(() => {
  globalThis.fetch = realFetch;
  delete process.env.CRAZY_EGG_API_KEY;
  delete process.env.CRAZY_EGG_APP_KEY;
});
afterEach(() => {
  globalThis.fetch = realFetch;
});

describe("listRecordingsTool", () => {
  test("has expected metadata and unstable warning", () => {
    const tool = listRecordingsTool(makeEnv());
    expect(tool.id).toBe("crazy_egg_list_recordings");
    expect(tool.description).toMatch(/undocumented|unstable|legacy/i);
  });

  test("hits /recordings.json signed and returns recordings array", async () => {
    const calls: FetchCall[] = [];
    mockFetch(
      calls,
      jsonResponse([
        { id: "r1", duration: 120 },
        { id: "r2", duration: 60 },
      ]),
    );

    const tool = listRecordingsTool(makeEnv());
    const result = await tool.execute({
      context: {},
      runtimeContext: makeRuntimeContext(v2State()),
    });

    expect(calls[0].url).toMatch(
      /^https:\/\/app\.crazyegg\.com\/api\/v2\/recordings\.json\?/,
    );
    expect(result.recordings).toHaveLength(2);
    expect(result.total).toBe(2);
  });
});
