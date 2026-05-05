import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import {
  type FetchCall,
  jsonResponse,
  makeEnv,
  makeRuntimeContext,
  mockFetch,
  v2State,
} from "./__test-helpers.ts";
import { listFunnelsTool } from "./list-funnels.ts";

const realFetch = globalThis.fetch;

beforeEach(() => {
  globalThis.fetch = realFetch;
  delete process.env.CRAZY_EGG_API_KEY;
  delete process.env.CRAZY_EGG_APP_KEY;
});
afterEach(() => {
  globalThis.fetch = realFetch;
});

describe("listFunnelsTool", () => {
  test("has expected metadata", () => {
    const tool = listFunnelsTool(makeEnv());
    expect(tool.id).toBe("crazy_egg_list_funnels");
    expect(tool.description).toMatch(/undocumented|unstable|legacy/i);
  });

  test("hits /funnels.json signed and returns funnels", async () => {
    const calls: FetchCall[] = [];
    mockFetch(
      calls,
      jsonResponse([
        {
          id: "f1",
          name: "Checkout",
          stages: [
            { name: "View Product", visitors: 1000 },
            { name: "Add to Cart", visitors: 500 },
            { name: "Purchase", visitors: 100 },
          ],
        },
      ]),
    );

    const tool = listFunnelsTool(makeEnv());
    const result = await tool.execute({
      context: {},
      runtimeContext: makeRuntimeContext(v2State()),
    });

    expect(calls[0].url).toMatch(
      /^https:\/\/app\.crazyegg\.com\/api\/v2\/funnels\.json\?/,
    );
    expect(result.funnels).toHaveLength(1);
  });
});
