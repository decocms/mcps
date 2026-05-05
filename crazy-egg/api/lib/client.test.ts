import { afterEach, beforeEach, describe, expect, mock, test } from "bun:test";
import { createHmac } from "node:crypto";
import {
  getSnapshot,
  listAbTests,
  listFunnels,
  listRecordings,
  listSnapshots,
  listSurveys,
  trackConversion,
  verifyCredentials,
} from "./client.ts";

const realFetch = globalThis.fetch;
const APP_KEY = "test-app-secret";
const API_KEY = "test-api-key";
const TRACKING_KEY = "track-key-123";

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

// ─── Public Conversion Tracking API ────────────────────────────────────────

describe("trackConversion", () => {
  test("POSTs to track.crazyegg.com/api/v1/conversions with key auth header", async () => {
    const calls: Array<{ url: string; init?: RequestInit }> = [];
    globalThis.fetch = mock(
      async (input: string | URL | Request, init?: RequestInit) => {
        calls.push({ url: String(input), init });
        return jsonResponse({ success: true, processed: 1 });
      },
    ) as unknown as typeof fetch;

    const result = await trackConversion({
      trackingKey: TRACKING_KEY,
      conversions: [
        { goalName: "purchase", userIdentifier: "user@example.com", value: 99 },
      ],
    });

    expect(calls).toHaveLength(1);
    expect(calls[0].url).toBe("https://track.crazyegg.com/api/v1/conversions");
    expect(calls[0].init?.method).toBe("POST");

    const headers = new Headers(calls[0].init?.headers);
    expect(headers.get("authorization")).toBe(`key ${TRACKING_KEY}`);
    expect(headers.get("content-type")).toBe("application/json");

    const body = JSON.parse(String(calls[0].init?.body));
    expect(body).toEqual({
      goalConversions: [
        { goalName: "purchase", userIdentifier: "user@example.com", value: 99 },
      ],
    });

    expect(result).toEqual({ success: true, processed: 1 });
  });

  test("throws on non-2xx response with status in message", async () => {
    globalThis.fetch = mock(
      async () => new Response("Bad Request", { status: 400 }),
    ) as unknown as typeof fetch;

    await expect(
      trackConversion({
        trackingKey: TRACKING_KEY,
        conversions: [{ goalName: "x", userIdentifier: "y" }],
      }),
    ).rejects.toThrow(/400/);
  });

  test("throws on 401 with helpful message about tracking key", async () => {
    globalThis.fetch = mock(
      async () => new Response("Unauthorized", { status: 401 }),
    ) as unknown as typeof fetch;

    await expect(
      trackConversion({
        trackingKey: "bad",
        conversions: [{ goalName: "x", userIdentifier: "y" }],
      }),
    ).rejects.toThrow(/401/);
  });

  test("rejects empty conversions array before calling API", async () => {
    const fetchMock = mock(async () => jsonResponse({}));
    globalThis.fetch = fetchMock as unknown as typeof fetch;

    await expect(
      trackConversion({ trackingKey: TRACKING_KEY, conversions: [] }),
    ).rejects.toThrow(/at least one/i);

    expect(fetchMock).not.toHaveBeenCalled();
  });

  test("rejects more than 25 conversions in a single request", async () => {
    const fetchMock = mock(async () => jsonResponse({}));
    globalThis.fetch = fetchMock as unknown as typeof fetch;

    const conversions = Array.from({ length: 26 }, (_, i) => ({
      goalName: "x",
      userIdentifier: `u${i}`,
    }));

    await expect(
      trackConversion({ trackingKey: TRACKING_KEY, conversions }),
    ).rejects.toThrow(/25/);

    expect(fetchMock).not.toHaveBeenCalled();
  });
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

describe("getSnapshot", () => {
  test("GETs /snapshots/{id}.json signed with api_key", async () => {
    const calls: Array<{ url: string }> = [];
    globalThis.fetch = mock(async (input: string | URL | Request) => {
      calls.push({ url: String(input) });
      return jsonResponse({ id: "abc-123", name: "Detail" });
    }) as unknown as typeof fetch;

    await getSnapshot({
      apiKey: API_KEY,
      appKey: APP_KEY,
      snapshotId: "abc-123",
    });

    const sig = expectedSignature(`api_key${API_KEY}`, APP_KEY);
    expect(calls[0].url).toBe(
      `https://app.crazyegg.com/api/v2/snapshots/abc-123.json?api_key=${API_KEY}&signed=${sig}`,
    );
  });
});

describe("listRecordings", () => {
  test("GETs /recordings.json signed with api_key", async () => {
    const calls: Array<{ url: string }> = [];
    globalThis.fetch = mock(async (input: string | URL | Request) => {
      calls.push({ url: String(input) });
      return jsonResponse([]);
    }) as unknown as typeof fetch;

    await listRecordings({ apiKey: API_KEY, appKey: APP_KEY });

    expect(calls[0].url).toMatch(
      /^https:\/\/app\.crazyegg\.com\/api\/v2\/recordings\.json\?/,
    );
  });
});

describe("listAbTests", () => {
  test("GETs /ab_tests.json signed with api_key", async () => {
    const calls: Array<{ url: string }> = [];
    globalThis.fetch = mock(async (input: string | URL | Request) => {
      calls.push({ url: String(input) });
      return jsonResponse([]);
    }) as unknown as typeof fetch;

    await listAbTests({ apiKey: API_KEY, appKey: APP_KEY });

    expect(calls[0].url).toMatch(
      /^https:\/\/app\.crazyegg\.com\/api\/v2\/ab_tests\.json\?/,
    );
  });
});

describe("listFunnels", () => {
  test("GETs /funnels.json signed with api_key", async () => {
    const calls: Array<{ url: string }> = [];
    globalThis.fetch = mock(async (input: string | URL | Request) => {
      calls.push({ url: String(input) });
      return jsonResponse([]);
    }) as unknown as typeof fetch;

    await listFunnels({ apiKey: API_KEY, appKey: APP_KEY });

    expect(calls[0].url).toMatch(
      /^https:\/\/app\.crazyegg\.com\/api\/v2\/funnels\.json\?/,
    );
  });
});

describe("listSurveys", () => {
  test("GETs /surveys.json signed with api_key", async () => {
    const calls: Array<{ url: string }> = [];
    globalThis.fetch = mock(async (input: string | URL | Request) => {
      calls.push({ url: String(input) });
      return jsonResponse([]);
    }) as unknown as typeof fetch;

    await listSurveys({ apiKey: API_KEY, appKey: APP_KEY });

    expect(calls[0].url).toMatch(
      /^https:\/\/app\.crazyegg\.com\/api\/v2\/surveys\.json\?/,
    );
  });
});
