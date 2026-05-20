import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import {
  type FetchCall,
  jsonResponse,
  makeEnv,
  makeRuntimeContext,
  mockFetch,
  v2State,
} from "./__test-helpers.ts";
import { verifyCredentialsTool } from "./verify-credentials.ts";

const realFetch = globalThis.fetch;

beforeEach(() => {
  globalThis.fetch = realFetch;
  delete process.env.CRAZY_EGG_API_KEY;
  delete process.env.CRAZY_EGG_APP_KEY;
});
afterEach(() => {
  globalThis.fetch = realFetch;
});

describe("verifyCredentialsTool", () => {
  test("has expected metadata", () => {
    const tool = verifyCredentialsTool(makeEnv());
    expect(tool.id).toBe("crazy_egg_verify_credentials");
    expect(tool._meta).toBeUndefined();
  });

  test("hits /authenticate.json with both keys signed", async () => {
    const calls: FetchCall[] = [];
    mockFetch(calls, jsonResponse({ ok: true }));

    const tool = verifyCredentialsTool(makeEnv());
    const result = await tool.execute({
      context: {},
      runtimeContext: makeRuntimeContext(v2State()),
    });

    expect(calls[0].url).toMatch(
      /^https:\/\/app\.crazyegg\.com\/api\/v2\/authenticate\.json\?/,
    );
    expect(calls[0].url).toContain("test=value");
    expect(calls[0].url).toContain("signed=");
    expect(result.authenticated).toBe(true);
  });

  test("returns authenticated=false on 401", async () => {
    const calls: FetchCall[] = [];
    mockFetch(calls, new Response("Unauthorized", { status: 401 }));

    const tool = verifyCredentialsTool(makeEnv());
    const result = await tool.execute({
      context: {},
      runtimeContext: makeRuntimeContext(v2State()),
    });

    expect(result.authenticated).toBe(false);
    expect(result.error).toMatch(/401/);
  });

  test("throws when api key is missing", async () => {
    const tool = verifyCredentialsTool(makeEnv());
    await expect(
      tool.execute({
        context: {},
        runtimeContext: makeRuntimeContext({
          CRAZY_EGG_APP_KEY: "x",
        }),
      }),
    ).rejects.toThrow(/CRAZY_EGG_API_KEY/);
  });
});
