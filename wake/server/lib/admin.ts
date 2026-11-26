/**
 * Wake Admin REST client (api.fbits.net).
 *
 * Authenticates with the Admin API token as an HTTP Basic credential
 * (`Authorization: Basic <token>`). Used by the admin tools (orders, product
 * images). Every request goes through a per-token rate gate (rate-gate.ts):
 * Wake blocks a token for an hour when it keeps calling past its limit.
 */
import type { Env } from "../types/env.ts";
import {
  createRateGate,
  parseRetryAfter,
  RateLimitedError,
} from "./rate-gate.ts";

const ADMIN_BASE = "https://api.fbits.net";
const REQUEST_TIMEOUT_MS = 30_000;

/** Wake allows 120/min per token and endpoint group; stay under it across groups. */
const MAX_PER_MINUTE = Number(process.env.WAKE_ADMIN_MAX_PER_MINUTE) || 100;
const gate = createRateGate({ perMinute: MAX_PER_MINUTE, maxWaitMs: 15_000 });

/** A page of a list endpoint, with Wake's `x-total-count` when it sends one. */
export interface AdminPage<T> {
  data: T;
  total: number | null;
}

export interface AdminClient {
  get<T = unknown>(path: string, query?: Record<string, unknown>): Promise<T>;
  getPage<T = unknown>(
    path: string,
    query?: Record<string, unknown>,
  ): Promise<AdminPage<T>>;
  post<T = unknown>(
    path: string,
    body: unknown,
    query?: Record<string, unknown>,
  ): Promise<T>;
  delete<T = unknown>(
    path: string,
    query?: Record<string, unknown>,
  ): Promise<T>;
}

/** Prefix of the error thrown when Wake rejects the apiToken, so callers can
 *  tell the user to renew it instead of showing a generic failure. */
export const ADMIN_TOKEN_REJECTED = "[wake-admin-token-rejected]";

/** The error message for a failed Admin API response. */
export function adminErrorMessage(
  status: number,
  statusText: string,
  body: string,
): string {
  if (status === 401 || status === 403) {
    return `${ADMIN_TOKEN_REJECTED} The Wake Admin API rejected the apiToken (HTTP ${status}): it has expired, was revoked, lacks permission for this endpoint, or does not accept requests from this server. Generate a new token in the Wake admin and update the apiToken field of this Wake connection.`;
  }
  return `Wake Admin API HTTP ${status} ${statusText}: ${body.slice(0, 500)}`;
}

/** Reads the Admin API token from the per-request configuration state. */
export function getApiToken(env: Env): string {
  const token = env.MESH_REQUEST_CONTEXT?.state?.apiToken;
  if (!token) {
    throw new Error(
      "Wake apiToken is not configured. It is required for admin tools (orders/analytics) and is sent as the `Authorization: Basic <token>` header for api.fbits.net.",
    );
  }
  return token;
}

/** Arrays become repeated keys (`a=1&a=2`), as Wake's array parameters expect. */
export function buildQueryString(query: Record<string, unknown>): string {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(query)) {
    for (const item of Array.isArray(value) ? value : [value]) {
      if (item === undefined || item === null || item === "") continue;
      params.append(key, String(item));
    }
  }
  const encoded = params.toString();
  return encoded ? `?${encoded}` : "";
}

/** REST list endpoints return arrays; wrap them so tools always return an object. */
export function asResult(data: unknown): Record<string, unknown> {
  if (Array.isArray(data)) return { items: data, count: data.length };
  if (data && typeof data === "object") return data as Record<string, unknown>;
  return { result: data };
}

export function createAdminClient(env: Env): AdminClient {
  const token = getApiToken(env);

  async function request<T>(
    method: "GET" | "POST" | "DELETE",
    path: string,
    query: Record<string, unknown> = {},
    body?: unknown,
  ): Promise<AdminPage<T>> {
    await gate.acquire(token);

    const url = `${ADMIN_BASE}${path}${buildQueryString(query)}`;
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

    let response: Response;
    try {
      response = await fetch(url, {
        method,
        headers: {
          Accept: "application/json",
          Authorization: `Basic ${token}`,
          ...(body === undefined ? {} : { "Content-Type": "application/json" }),
        },
        body: body === undefined ? undefined : JSON.stringify(body),
        signal: controller.signal,
      });
    } catch (error) {
      if ((error as { name?: string })?.name === "AbortError") {
        throw new Error(
          `Wake Admin API request timed out after ${REQUEST_TIMEOUT_MS}ms.`,
        );
      }
      throw error;
    } finally {
      clearTimeout(timeout);
    }

    if (response.status === 429) {
      const seconds = parseRetryAfter(response.headers.get("retry-after"));
      gate.block(token, seconds);
      throw new RateLimitedError(
        seconds,
        "Wake Admin API answered 429 (too many requests).",
      );
    }

    const text = await response.text().catch(() => "");
    if (!response.ok) {
      throw new Error(
        adminErrorMessage(response.status, response.statusText, text),
      );
    }
    const totalHeader = response.headers.get("x-total-count")?.trim();
    const total =
      totalHeader && Number.isFinite(Number(totalHeader))
        ? Number(totalHeader)
        : null;
    if (!text) return { data: null as T, total };
    try {
      return { data: JSON.parse(text) as T, total };
    } catch {
      return { data: text as T, total };
    }
  }

  return {
    get: async <T>(path: string, query?: Record<string, unknown>) =>
      (await request<T>("GET", path, query)).data,
    getPage: <T>(path: string, query?: Record<string, unknown>) =>
      request<T>("GET", path, query),
    post: async <T>(
      path: string,
      body: unknown,
      query?: Record<string, unknown>,
    ) => (await request<T>("POST", path, query, body)).data,
    delete: async <T>(path: string, query?: Record<string, unknown>) =>
      (await request<T>("DELETE", path, query)).data,
  };
}
