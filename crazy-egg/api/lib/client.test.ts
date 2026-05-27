import { afterEach, beforeEach, describe, expect, mock, test } from "bun:test";
import { createHmac } from "node:crypto";
import { listSnapshots, verifyCredentials } from "./client.ts";

const realFetch = globalThis.fetch;
const APP_KEY = "test-app-secret";
const API_KEY = "test-api-key";

function expectedSignature(content: string, secret: string): string {
  return createHmac("sha256", secret).update(content).digest("hex");
}

function jsonResponse(body: unknown, init: ResponseInit = {}): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { "Content-Type": "application/json" },
    ...init,
  });
}

beforeEach(() => {
  globalThis.fetch = realFetch;
});
afterEach(() => {
  globalThis.fetch = realFetch;
});

// ─── Legacy v2 read API ────────────────────────────────────────────────────

describe("verifyCredentials", () => {
  test("GETs /authenticate.json with signed test=value param", async () => {
    const calls: Array<{ url: string }> = [];
    globalThis.fetch = mock(async (input: string | URL | Request) => {
      calls.push({ url: String(input) });
      return jsonResponse({ authenticated: true });
    }) as unknown as typeof fetch;

    await verifyCredentials({ apiKey: API_KEY, appKey: APP_KEY });

    const sig = expectedSignature(`api_key${API_KEY}testvalue`, APP_KEY);
    expect(calls[0].url).toBe(
      `https://app.crazyegg.com/api/v2/authenticate.json?api_key=${API_KEY}&test=value&signed=${sig}`,
    );
  });
});

describe("listSnapshots", () => {
  test("GETs /snapshots.json signed with api_key", async () => {
    const calls: Array<{ url: string }> = [];
    const snapshots = [
      {
        id: "abc",
        name: "Homepage",
        source_url: "https://example.com",
        thumbnail_url: "https://thumb",
        heatmap_url: "https://heatmap",
        screenshot_url: "https://screenshot",
        total_visits: 100,
        total_clicks: 25,
        status: "active",
      },
    ];
    globalThis.fetch = mock(async (input: string | URL | Request) => {
      calls.push({ url: String(input) });
      return jsonResponse(snapshots);
    }) as unknown as typeof fetch;

    const result = await listSnapshots({ apiKey: API_KEY, appKey: APP_KEY });

    const sig = expectedSignature(`api_key${API_KEY}`, APP_KEY);
    expect(calls[0].url).toBe(
      `https://app.crazyegg.com/api/v2/snapshots.json?api_key=${API_KEY}&signed=${sig}`,
    );
    expect(result).toEqual(snapshots);
  });

  test("returns empty array when API returns []", async () => {
    globalThis.fetch = mock(async () =>
      jsonResponse([]),
    ) as unknown as typeof fetch;

    const result = await listSnapshots({ apiKey: API_KEY, appKey: APP_KEY });
    expect(result).toEqual([]);
  });

  test("throws on 401 with auth-failed hint", async () => {
    globalThis.fetch = mock(
      async () => new Response("Unauthorized", { status: 401 }),
    ) as unknown as typeof fetch;

    await expect(
      listSnapshots({ apiKey: API_KEY, appKey: APP_KEY }),
    ).rejects.toThrow(/401/);
  });
});
