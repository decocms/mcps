import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import {
  type FetchCall,
  jsonResponse,
  makeEnv,
  makeRuntimeContext,
  mockFetch,
  v2State,
} from "./__test-helpers.ts";
import { listAbTestsTool } from "./list-ab-tests.ts";

const realFetch = globalThis.fetch;

beforeEach(() => {
  globalThis.fetch = realFetch;
  delete process.env.CRAZY_EGG_API_KEY;
  delete process.env.CRAZY_EGG_APP_KEY;
});
afterEach(() => {
  globalThis.fetch = realFetch;
});

describe("listAbTestsTool", () => {
  test("has expected metadata", () => {
    const tool = listAbTestsTool(makeEnv());
    expect(tool.id).toBe("crazy_egg_list_ab_tests");
    expect(tool.description).toMatch(/undocumented|unstable|legacy/i);
  });

  test("hits /ab_tests.json signed and returns abTests array", async () => {
    const calls: FetchCall[] = [];
    mockFetch(
      calls,
      jsonResponse([
        {
          id: "ab-1",
          name: "CTA copy",
          variations: [
            { name: "control", visitors: 1000, conversions: 50 },
            { name: "B", visitors: 1000, conversions: 75 },
          ],
        },
      ]),
    );

    const tool = listAbTestsTool(makeEnv());
    const result = await tool.execute({
      context: {},
      runtimeContext: makeRuntimeContext(v2State()),
    });

    expect(calls[0].url).toMatch(
      /^https:\/\/app\.crazyegg\.com\/api\/v2\/ab_tests\.json\?/,
    );
    expect(result.abTests).toHaveLength(1);
    expect(result.abTests[0].id).toBe("ab-1");
  });
});
