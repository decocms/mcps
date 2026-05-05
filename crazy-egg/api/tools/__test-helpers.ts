import { mock } from "bun:test";
import type { Env } from "../types/env.ts";

// biome-ignore lint/suspicious/noExplicitAny: AppContext shape is internal
export function makeRuntimeContext(state: Record<string, unknown>): any {
  return {
    env: {
      MESH_REQUEST_CONTEXT: { state },
    },
  };
}

export function makeEnv(): Env {
  return {} as Env;
}

export type FetchCall = { url: string; init?: RequestInit };

export function mockFetch(
  calls: FetchCall[],
  response: Response | (() => Response),
): typeof fetch {
  const m = mock(async (input: string | URL | Request, init?: RequestInit) => {
    calls.push({ url: String(input), init });
    return typeof response === "function" ? response() : response;
  });
  globalThis.fetch = m as unknown as typeof fetch;
  return m as unknown as typeof fetch;
}

export function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

export const TEST_API_KEY = "test-api-key";
export const TEST_APP_KEY = "test-app-key";

export function v2State() {
  return {
    CRAZY_EGG_API_KEY: TEST_API_KEY,
    CRAZY_EGG_APP_KEY: TEST_APP_KEY,
  };
}
