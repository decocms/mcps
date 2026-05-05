import { describe, expect, test } from "bun:test";
import { createHmac } from "node:crypto";
import { buildSignedQueryString, signUrl } from "./signer.ts";

const APP_KEY = "test-app-secret-12345";
const API_KEY = "test-api-key-abcde";

function expectedSignature(content: string, secret: string): string {
  return createHmac("sha256", secret).update(content).digest("hex");
}

describe("buildSignedQueryString", () => {
  test("strips '=' from each pair, sorts alphabetically by key, signs with HMAC-SHA256", () => {
    const params = { api_key: API_KEY, test: "value" };
    const result = buildSignedQueryString(params, APP_KEY);

    // Sort alphabetically by key: api_key first, then test
    // Strip '=' between key and value: "api_key" + API_KEY + "test" + "value"
    const content = `api_key${API_KEY}testvalue`;
    const sig = expectedSignature(content, APP_KEY);

    expect(result).toBe(`api_key=${API_KEY}&test=value&signed=${sig}`);
  });

  test("sorts by key when params are passed out of order", () => {
    const params = { z_param: "1", a_param: "2", api_key: API_KEY };
    const result = buildSignedQueryString(params, APP_KEY);

    const content = `a_param2api_key${API_KEY}z_param1`;
    const sig = expectedSignature(content, APP_KEY);

    expect(result).toBe(`a_param=2&api_key=${API_KEY}&z_param=1&signed=${sig}`);
  });

  test("handles a single param", () => {
    const params = { api_key: API_KEY };
    const result = buildSignedQueryString(params, APP_KEY);

    const content = `api_key${API_KEY}`;
    const sig = expectedSignature(content, APP_KEY);

    expect(result).toBe(`api_key=${API_KEY}&signed=${sig}`);
  });

  test("returns 'signed=...' only when params are empty", () => {
    const result = buildSignedQueryString({}, APP_KEY);
    const sig = expectedSignature("", APP_KEY);
    expect(result).toBe(`signed=${sig}`);
  });

  test("returns deterministic signature for same input", () => {
    const params = { api_key: API_KEY, foo: "bar" };
    const a = buildSignedQueryString(params, APP_KEY);
    const b = buildSignedQueryString(params, APP_KEY);
    expect(a).toBe(b);
  });

  test("different secrets produce different signatures", () => {
    const params = { api_key: API_KEY };
    const a = buildSignedQueryString(params, "secretA");
    const b = buildSignedQueryString(params, "secretB");
    const sigA = a.split("&signed=")[1] ?? a.split("signed=")[1];
    const sigB = b.split("&signed=")[1] ?? b.split("signed=")[1];
    expect(sigA).not.toBe(sigB);
  });

  test("changing one param value changes the signature", () => {
    const a = buildSignedQueryString({ x: "1" }, APP_KEY);
    const b = buildSignedQueryString({ x: "2" }, APP_KEY);
    expect(a).not.toBe(b);
  });

  test("ignores undefined values (not signed, not in query)", () => {
    const params = { api_key: API_KEY, optional: undefined };
    const result = buildSignedQueryString(params, APP_KEY);

    const content = `api_key${API_KEY}`;
    const sig = expectedSignature(content, APP_KEY);

    expect(result).toBe(`api_key=${API_KEY}&signed=${sig}`);
  });

  test("coerces numeric values to strings for signing and query", () => {
    const params = { count: 42, api_key: API_KEY };
    const result = buildSignedQueryString(params, APP_KEY);

    // Sorted: api_key, count
    const content = `api_key${API_KEY}count42`;
    const sig = expectedSignature(content, APP_KEY);

    expect(result).toBe(`api_key=${API_KEY}&count=42&signed=${sig}`);
  });
});

describe("signUrl", () => {
  test("appends signed query string to a URL with no params", () => {
    const result = signUrl(
      "https://app.crazyegg.com/api/v2/snapshots.json",
      { api_key: API_KEY },
      APP_KEY,
    );

    const content = `api_key${API_KEY}`;
    const sig = expectedSignature(content, APP_KEY);

    expect(result).toBe(
      `https://app.crazyegg.com/api/v2/snapshots.json?api_key=${API_KEY}&signed=${sig}`,
    );
  });

  test("uses '?' for first separator and signs all params", () => {
    const result = signUrl(
      "https://app.crazyegg.com/api/v2/authenticate.json",
      { test: "value", api_key: API_KEY },
      APP_KEY,
    );

    const content = `api_key${API_KEY}testvalue`;
    const sig = expectedSignature(content, APP_KEY);

    expect(result).toBe(
      `https://app.crazyegg.com/api/v2/authenticate.json?api_key=${API_KEY}&test=value&signed=${sig}`,
    );
  });
});
