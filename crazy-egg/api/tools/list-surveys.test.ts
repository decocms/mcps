import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import {
  type FetchCall,
  jsonResponse,
  makeEnv,
  makeRuntimeContext,
  mockFetch,
  v2State,
} from "./__test-helpers.ts";
import { listSurveysTool } from "./list-surveys.ts";

const realFetch = globalThis.fetch;

beforeEach(() => {
  globalThis.fetch = realFetch;
  delete process.env.CRAZY_EGG_API_KEY;
  delete process.env.CRAZY_EGG_APP_KEY;
});
afterEach(() => {
  globalThis.fetch = realFetch;
});

describe("listSurveysTool", () => {
  test("has expected metadata", () => {
    const tool = listSurveysTool(makeEnv());
    expect(tool.id).toBe("crazy_egg_list_surveys");
    expect(tool.description).toMatch(/undocumented|unstable|legacy/i);
  });

  test("hits /surveys.json signed and returns surveys", async () => {
    const calls: FetchCall[] = [];
    mockFetch(
      calls,
      jsonResponse([{ id: "s1", name: "Exit Intent", responses_count: 42 }]),
    );

    const tool = listSurveysTool(makeEnv());
    const result = await tool.execute({
      context: {},
      runtimeContext: makeRuntimeContext(v2State()),
    });

    expect(calls[0].url).toMatch(
      /^https:\/\/app\.crazyegg\.com\/api\/v2\/surveys\.json\?/,
    );
    expect(result.surveys).toHaveLength(1);
  });
});
