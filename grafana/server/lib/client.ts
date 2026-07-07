/**
 * Thin HTTP client for the Grafana HTTP API.
 * All tools go through `grafanaFetch`, which injects the base URL + Bearer token.
 */

import { grafanaConfig, type Env } from "../types/env.ts";

export async function grafanaFetch<T = unknown>(
  env: Env,
  path: string,
  init: RequestInit = {},
): Promise<T> {
  const { url, token } = grafanaConfig(env);
  const res = await fetch(`${url}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: "application/json",
      ...(init.body ? { "Content-Type": "application/json" } : {}),
      ...(init.headers ?? {}),
    },
    signal: AbortSignal.timeout(30_000),
  });
  const text = await res.text();
  if (!res.ok) {
    throw new Error(
      `Grafana ${init.method ?? "GET"} ${path} failed (${res.status}): ${text.slice(0, 500)}`,
    );
  }
  return (text ? JSON.parse(text) : null) as T;
}

/**
 * POST /api/ds/query — the generic datasource query endpoint. `queries` is the
 * raw Grafana query array (each item names its datasource + expr/rawSql/etc).
 */
export function dsQuery(
  env: Env,
  queries: Array<Record<string, unknown>>,
  range?: { from: string; to: string },
): Promise<Record<string, unknown>> {
  return grafanaFetch(env, "/api/ds/query", {
    method: "POST",
    body: JSON.stringify({
      queries,
      ...(range ? { from: range.from, to: range.to } : {}),
    }),
  });
}
