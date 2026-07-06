/**
 * Thin authenticated fetch wrappers for the YouTube Data API v3 and the
 * YouTube Analytics API v2. Endpoint shapes mirror the reference client in
 * deco-cx/apps google-youtube/utils/client.ts.
 */
import { ANALYTICS_API_BASE, DATA_API_BASE } from "../constants.ts";
import type { Env } from "../types/env.ts";
import { getAccessToken } from "./auth.ts";

type Params = Record<string, string | number | boolean | undefined>;

function buildUrl(base: string, path: string, params?: Params): string {
  const url = new URL(`${base}${path}`);
  for (const [key, value] of Object.entries(params ?? {})) {
    if (value !== undefined) url.searchParams.set(key, String(value));
  }
  return url.toString();
}

async function parseGoogleError(response: Response): Promise<string> {
  const raw = await response.text();
  try {
    const parsed = JSON.parse(raw) as {
      error?: { message?: string; errors?: Array<{ reason?: string }> };
    };
    const reason = parsed.error?.errors?.[0]?.reason;
    return `${parsed.error?.message ?? raw}${reason ? ` (reason: ${reason})` : ""}`;
  } catch {
    return raw.slice(0, 500);
  }
}

export async function googleFetch<T>(
  env: Env,
  url: string,
  init: RequestInit = {},
): Promise<T> {
  const token = getAccessToken(env);
  const response = await fetch(url, {
    ...init,
    headers: {
      Authorization: `Bearer ${token}`,
      ...init.headers,
    },
  });
  if (!response.ok) {
    throw new Error(
      `YouTube API ${init.method ?? "GET"} ${new URL(url).pathname} failed (${response.status}): ${await parseGoogleError(response)}`,
    );
  }
  if (response.status === 204) return undefined as T;
  const contentType = response.headers.get("content-type") ?? "";
  if (!contentType.includes("json")) {
    return (await response.text()) as unknown as T;
  }
  return (await response.json()) as T;
}

/** GET/POST/PUT against the Data API (youtube/v3). */
export function dataApi<T>(
  env: Env,
  path: string,
  options: { params?: Params; method?: string; body?: unknown } = {},
): Promise<T> {
  const url = buildUrl(DATA_API_BASE, path, options.params);
  const init: RequestInit = { method: options.method ?? "GET" };
  if (options.body !== undefined) {
    init.body = JSON.stringify(options.body);
    init.headers = { "Content-Type": "application/json" };
  } else if (init.method === "POST") {
    // Google rejects bodyless POSTs without an explicit zero length
    // (e.g. comments/setModerationStatus).
    init.headers = { "Content-Length": "0" };
  }
  return googleFetch<T>(env, url, init);
}

export interface AnalyticsResponse {
  columnHeaders?: Array<{
    name: string;
    columnType: string;
    dataType: string;
  }>;
  rows?: Array<Array<string | number>>;
}

/** Query the Analytics API v2 reports endpoint for the authorized channel. */
export function analyticsApi(
  env: Env,
  params: Params,
): Promise<AnalyticsResponse> {
  const url = new URL(ANALYTICS_API_BASE);
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined) url.searchParams.set(key, String(value));
  }
  url.searchParams.set("ids", "channel==MINE");
  return googleFetch<AnalyticsResponse>(env, url.toString());
}

/** Parses ISO8601 durations (PT1H2M3S) into seconds. */
export function parseIsoDuration(iso: string | undefined): number | undefined {
  if (!iso) return undefined;
  const match = iso.match(/^PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+(?:\.\d+)?)S)?$/);
  if (!match) return undefined;
  return (
    Number(match[1] ?? 0) * 3600 +
    Number(match[2] ?? 0) * 60 +
    Math.round(Number(match[3] ?? 0))
  );
}

/** Formats a Date as the YYYY-MM-DD strings the Analytics API expects. */
export function toApiDate(date: Date): string {
  return date.toISOString().slice(0, 10);
}
