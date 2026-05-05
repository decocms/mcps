import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import type { Env } from "../types/env.ts";
import { getApiKey, getAppKey, getTrackingKey } from "./env.ts";

const ENV_KEYS = [
  "CRAZY_EGG_TRACKING_KEY",
  "CRAZY_EGG_API_KEY",
  "CRAZY_EGG_APP_KEY",
] as const;

const original: Record<string, string | undefined> = {};

beforeEach(() => {
  for (const k of ENV_KEYS) {
    original[k] = process.env[k];
    delete process.env[k];
  }
});

afterEach(() => {
  for (const k of ENV_KEYS) {
    if (original[k] === undefined) {
      delete process.env[k];
    } else {
      process.env[k] = original[k];
    }
  }
});

function makeEnv(state: Record<string, unknown>): Env {
  return {
    MESH_REQUEST_CONTEXT: {
      state,
    },
  } as unknown as Env;
}

// ─── getTrackingKey ────────────────────────────────────────────────────────

describe("getTrackingKey", () => {
  test("reads from process.env first", () => {
    process.env.CRAZY_EGG_TRACKING_KEY = "from-process-env";
    expect(getTrackingKey(makeEnv({}))).toBe("from-process-env");
  });

  test("reads from runtime state when env var is not set", () => {
    const env = makeEnv({ CRAZY_EGG_TRACKING_KEY: "from-state" });
    expect(getTrackingKey(env)).toBe("from-state");
  });

  test("prefers process.env over state", () => {
    process.env.CRAZY_EGG_TRACKING_KEY = "win";
    const env = makeEnv({ CRAZY_EGG_TRACKING_KEY: "lose" });
    expect(getTrackingKey(env)).toBe("win");
  });

  test("throws when not configured anywhere", () => {
    expect(() => getTrackingKey(makeEnv({}))).toThrow(/CRAZY_EGG_TRACKING_KEY/);
  });

  test("error message points users at Site Settings → API", () => {
    expect(() => getTrackingKey(makeEnv({}))).toThrow(/Site Settings/i);
  });
});

// ─── getApiKey ─────────────────────────────────────────────────────────────

describe("getApiKey", () => {
  test("reads from process.env", () => {
    process.env.CRAZY_EGG_API_KEY = "api-from-env";
    expect(getApiKey(makeEnv({}))).toBe("api-from-env");
  });

  test("reads from runtime state", () => {
    const env = makeEnv({ CRAZY_EGG_API_KEY: "api-from-state" });
    expect(getApiKey(env)).toBe("api-from-state");
  });

  test("throws with hint about app.crazyegg.com/options/api", () => {
    expect(() => getApiKey(makeEnv({}))).toThrow(/options\/api/);
  });
});

// ─── getAppKey ─────────────────────────────────────────────────────────────

describe("getAppKey", () => {
  test("reads from process.env", () => {
    process.env.CRAZY_EGG_APP_KEY = "app-from-env";
    expect(getAppKey(makeEnv({}))).toBe("app-from-env");
  });

  test("reads from runtime state", () => {
    const env = makeEnv({ CRAZY_EGG_APP_KEY: "app-from-state" });
    expect(getAppKey(env)).toBe("app-from-state");
  });

  test("throws with hint about HMAC signing", () => {
    expect(() => getAppKey(makeEnv({}))).toThrow(/HMAC|signing|App Key/i);
  });
});
