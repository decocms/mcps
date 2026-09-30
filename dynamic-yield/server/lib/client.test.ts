import { afterEach, describe, expect, it } from "bun:test";
import { FeedBulkInputSchema } from "../tools/feed.ts";
import type { Env } from "../types/env.ts";
import { baseUrl, dyFetch, getApiKey } from "./client.ts";

const env = (authorization?: string, region?: "us" | "eu") =>
  ({
    MESH_REQUEST_CONTEXT: { authorization, state: { region } },
  }) as unknown as Env;

const realFetch = globalThis.fetch;
afterEach(() => {
  globalThis.fetch = realFetch;
});

describe("client", () => {
  it("maps region to base URL", () => {
    expect(baseUrl(undefined)).toBe("https://dy-api.com/v2");
    expect(baseUrl("eu")).toBe("https://dy-api.eu/v2");
  });

  it("strips Bearer and requires a key", () => {
    expect(getApiKey(env("Bearer test-key"))).toBe("test-key");
    expect(getApiKey(env("test-key"))).toBe("test-key");
    expect(() => getApiKey(env())).toThrow("missing Dynamic Yield API key");
  });

  it("sends the key and surfaces status, body and trace id on errors", async () => {
    let seen: Request | undefined;
    globalThis.fetch = (async (url: string, init: RequestInit) => {
      seen = new Request(url, init);
      return new Response('{"error":"bad key"}', {
        status: 401,
        headers: { "DY-Trace-ID": "trace-1" },
      });
    }) as typeof fetch;
    await expect(
      dyFetch(env("test-key", "eu"), "/serve/user/choose", { body: {} }),
    ).rejects.toThrow('401 (DY-Trace-ID trace-1): {"error":"bad key"}');
    expect(seen?.url).toBe("https://dy-api.eu/v2/serve/user/choose");
    expect(seen?.headers.get("DY-API-Key")).toBe("test-key");
  });

  it("wraps array responses", async () => {
    globalThis.fetch = (async () =>
      new Response(
        '[{"item":"sku-1","status":"success"}]',
      )) as unknown as typeof fetch;
    const result = await dyFetch(
      env("test-key"),
      "/feeds/000000/transaction/tx",
      {
        method: "GET",
      },
    );
    expect(result.items).toEqual([{ item: "sku-1", status: "success" }]);
  });
});

describe("DY_FEED_BULK input", () => {
  const row = {
    id: "sku-1",
    action: "update" as const,
    data: { sku: "sku-1" },
  };

  it("accepts up to 100 actions and delete without data", () => {
    expect(
      FeedBulkInputSchema.safeParse({
        feedId: "000000",
        requests: [...Array(99).fill(row), { id: "sku-2", action: "delete" }],
      }).success,
    ).toBe(true);
  });

  it("rejects more than 100 actions, update without data and a bad feed id", () => {
    const parse = (input: unknown) =>
      FeedBulkInputSchema.safeParse(input).success;
    expect(parse({ feedId: "000000", requests: Array(101).fill(row) })).toBe(
      false,
    );
    expect(
      parse({
        feedId: "000000",
        requests: [{ id: "sku-1", action: "update" }],
      }),
    ).toBe(false);
    expect(parse({ feedId: "../x", requests: [row] })).toBe(false);
    expect(parse({ feedId: "000000", requests: [] })).toBe(false);
  });
});
