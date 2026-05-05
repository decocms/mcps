import { afterEach, beforeEach, describe, expect, mock, test } from "bun:test";
import { makeEnv, makeRuntimeContext } from "./__test-helpers.ts";
import { trackConversionTool } from "./track-conversion.ts";

const realFetch = globalThis.fetch;

beforeEach(() => {
  globalThis.fetch = realFetch;
  delete process.env.CRAZY_EGG_TRACKING_KEY;
});
afterEach(() => {
  globalThis.fetch = realFetch;
});

describe("trackConversionTool", () => {
  test("has the expected id, description marker, and ui resourceUri", () => {
    const tool = trackConversionTool(makeEnv());
    expect(tool.id).toBe("crazy_egg_track_conversion");
    expect(tool.description).toMatch(/conversion/i);
    expect(tool._meta).toMatchObject({
      ui: { resourceUri: "ui://crazy-egg/dashboard" },
    });
  });

  test("calls the public conversion API with the tracking key from state", async () => {
    const fetchMock = mock(async () => {
      return new Response(JSON.stringify({ success: true, processed: 1 }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    });
    globalThis.fetch = fetchMock as unknown as typeof fetch;

    const tool = trackConversionTool(makeEnv());
    const runtimeContext = makeRuntimeContext({
      CRAZY_EGG_TRACKING_KEY: "tk-test",
    });

    const result = await tool.execute({
      context: {
        goalName: "purchase",
        userIdentifier: "user@example.com",
        value: 49.9,
        currency: "USD",
      },
      runtimeContext,
    });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0] as unknown as [
      string,
      RequestInit,
    ];
    expect(url).toBe("https://track.crazyegg.com/api/v1/conversions");
    expect(init.method).toBe("POST");
    const headers = new Headers(init.headers);
    expect(headers.get("authorization")).toBe("key tk-test");

    const body = JSON.parse(String(init.body));
    expect(body.goalConversions).toHaveLength(1);
    expect(body.goalConversions[0]).toMatchObject({
      goalName: "purchase",
      userIdentifier: "user@example.com",
      value: 49.9,
      currency: "USD",
    });

    expect(result).toMatchObject({ success: true, processed: 1 });
  });

  test("throws a descriptive error when the tracking key is missing", async () => {
    const tool = trackConversionTool(makeEnv());
    const runtimeContext = makeRuntimeContext({});

    await expect(
      tool.execute({
        context: { goalName: "g", userIdentifier: "u" },
        runtimeContext,
      }),
    ).rejects.toThrow(/CRAZY_EGG_TRACKING_KEY/);
  });

  test("forwards optional fields (utmParams, customData) into the request body", async () => {
    const fetchMock = mock(async () => {
      return new Response(JSON.stringify({ success: true }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    });
    globalThis.fetch = fetchMock as unknown as typeof fetch;

    const tool = trackConversionTool(makeEnv());
    const runtimeContext = makeRuntimeContext({
      CRAZY_EGG_TRACKING_KEY: "tk",
    });

    await tool.execute({
      context: {
        goalName: "signup",
        userIdentifier: "u1",
        utmParams: { utm_source: "google", utm_campaign: "spring" },
        customData: { plan: "pro" },
      },
      runtimeContext,
    });

    const [, init] = fetchMock.mock.calls[0] as unknown as [
      string,
      RequestInit,
    ];
    const body = JSON.parse(String(init.body));
    expect(body.goalConversions[0].utmParams).toEqual({
      utm_source: "google",
      utm_campaign: "spring",
    });
    expect(body.goalConversions[0].customData).toEqual({ plan: "pro" });
  });
});
