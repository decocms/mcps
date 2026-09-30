import type { Env } from "../types/env.ts";

const BASE_URLS = {
  us: "https://dy-api.com/v2",
  eu: "https://dy-api.eu/v2",
} as const;

const TIMEOUT_MS = 30_000;

export function baseUrl(region: keyof typeof BASE_URLS | undefined): string {
  return BASE_URLS[region ?? "us"];
}

export function getApiKey(env: Env): string {
  const auth = env.MESH_REQUEST_CONTEXT?.authorization ?? "";
  const key = auth.startsWith("Bearer ") ? auth.slice(7) : auth;
  if (!key) {
    throw new Error(
      "Unauthorized: missing Dynamic Yield API key. Configure the connection with a server-side DY API key.",
    );
  }
  return key;
}

export async function dyFetch(
  env: Env,
  path: string,
  init: { method?: "GET" | "POST"; body?: unknown; apiKey?: string } = {},
): Promise<Record<string, unknown>> {
  const response = await fetch(
    `${baseUrl(env.MESH_REQUEST_CONTEXT?.state?.region)}${path}`,
    {
      method: init.method ?? "POST",
      headers: {
        "DY-API-Key": init.apiKey ?? getApiKey(env),
        "Content-Type": "application/json",
      },
      body: init.body === undefined ? undefined : JSON.stringify(init.body),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    },
  );
  const traceId = response.headers.get("DY-Trace-ID") ?? undefined;
  const text = await response.text();
  if (!response.ok) {
    throw new Error(
      `Dynamic Yield API error ${response.status}${traceId ? ` (DY-Trace-ID ${traceId})` : ""}: ${text.slice(0, 2000)}`,
    );
  }
  if (!text) return { status: response.status, traceId };
  const data: unknown = JSON.parse(text);
  // Some endpoints (transaction status) return a bare array.
  return Array.isArray(data)
    ? { items: data, traceId }
    : { ...(data as Record<string, unknown>), traceId };
}
