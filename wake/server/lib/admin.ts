/**
 * Wake Admin REST client (api.fbits.net).
 *
 * Authenticates with the Admin API token as an HTTP Basic credential
 * (`Authorization: Basic <token>`). Used by the admin/analytics tools (orders).
 */
import type { Env } from "../types/env.ts";

const ADMIN_BASE = "https://api.fbits.net";
const REQUEST_TIMEOUT_MS = 30_000;

export interface AdminClient {
  get<T = unknown>(path: string, query?: Record<string, unknown>): Promise<T>;
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

  return {
    async get<T = unknown>(
      path: string,
      query: Record<string, unknown> = {},
    ): Promise<T> {
      const url = `${ADMIN_BASE}${path}${buildQueryString(query)}`;
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

      let response: Response;
      try {
        response = await fetch(url, {
          method: "GET",
          headers: {
            Accept: "application/json",
            Authorization: `Basic ${token}`,
          },
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

      if (!response.ok) {
        const body = await response.text().catch(() => "");
        throw new Error(
          `Wake Admin API HTTP ${response.status} ${response.statusText}: ${body.slice(0, 500)}`,
        );
      }

      return (await response.json()) as T;
    },
  };
}
