/**
 * Wake Admin REST client (api.fbits.net).
 *
 * Authenticates with the Admin API token as an HTTP Basic credential
 * (`Authorization: Basic <token>`). Used by the admin tools (orders, product
 * images).
 */
import type { Env } from "../types/env.ts";

const ADMIN_BASE = "https://api.fbits.net";
const REQUEST_TIMEOUT_MS = 30_000;

export interface AdminClient {
  get<T = unknown>(path: string, query?: Record<string, unknown>): Promise<T>;
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

function buildQueryString(query: Record<string, unknown>): string {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(query)) {
    if (value === undefined || value === null || value === "") continue;
    params.set(key, String(value));
  }
  const encoded = params.toString();
  return encoded ? `?${encoded}` : "";
}

export function createAdminClient(env: Env): AdminClient {
  const token = getApiToken(env);

  async function request<T>(
    method: "GET" | "POST" | "DELETE",
    path: string,
    query: Record<string, unknown> = {},
    body?: unknown,
  ): Promise<T> {
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

    const text = await response.text().catch(() => "");
    if (!response.ok) {
      throw new Error(
        adminErrorMessage(response.status, response.statusText, text),
      );
    }
    if (!text) return null as T;
    try {
      return JSON.parse(text) as T;
    } catch {
      return text as T;
    }
  }

  return {
    get: (path, query) => request("GET", path, query),
    post: (path, body, query) => request("POST", path, query, body),
    delete: (path, query) => request("DELETE", path, query),
  };
}
