/**
 * VtexId session-token auth for VTEX's INTERNAL endpoints.
 *
 * A handful of VTEX services (the admin home dashboard analytics under
 * `/api/analytics/consumption/*`, and others) are NOT part of the public
 * OpenAPI specs and REJECT the usual `X-VTEX-API-AppKey` / `X-VTEX-API-AppToken`
 * headers with `401`. They only accept a VtexId **session token**, the same
 * credential the browser sends as the `VtexIdclientAutCookie` cookie.
 *
 * This module turns the connection's App Key/Token into such a session token:
 *
 *   1. `POST /api/vtexid/apptoken/login` with `{ appkey, apptoken }` → `{ token }`.
 *   2. Send `token` as the `VtexIdclientAutCookie` cookie on the internal request.
 *
 * Use `getVtexIdSessionToken(creds)` (cached) + `vtexIdCookieHeader(token)` from
 * any tool that needs to reach an internal endpoint. Example:
 *
 *   const token = await getVtexIdSessionToken({ accountName, appKey, appToken });
 *   const res = await fetch(url, {
 *     headers: { Accept: "application/json", Cookie: vtexIdCookieHeader(token) },
 *   });
 */
import type { VTEXCredentials } from "../types/env.ts";

export const VTEXID_COOKIE_NAME = "VtexIdclientAutCookie";

/** Token is re-minted this long before its real expiry, to avoid races. */
const EXPIRY_SAFETY_MARGIN_MS = 60_000;
/** Used when a token's `exp` claim cannot be parsed. */
const FALLBACK_TTL_MS = 5 * 60_000;

export function buildAppTokenLoginUrl(accountName: string): string {
  return `https://${accountName}.vtexcommercestable.com.br/api/vtexid/apptoken/login?an=${encodeURIComponent(
    accountName,
  )}`;
}

/** Cookie header value for an authenticated VtexId session. */
export function vtexIdCookieHeader(token: string): string {
  return `${VTEXID_COOKIE_NAME}=${token}`;
}

/** Headers for internal VTEX admin endpoints (matches browser fetch shape). */
export function vtexIdAuthHeaders(
  accountName: string,
  token: string,
  creds?: Pick<VTEXCredentials, "appKey" | "appToken">,
): Record<string, string> {
  const origin = `https://${accountName}.myvtex.com`;

  const headers: Record<string, string> = {
    Accept: "application/json",
    Cookie: vtexIdCookieHeader(token),
    [VTEXID_COOKIE_NAME]: token,
    Referer: `${origin}/admin/`,
    Origin: origin,
  };

  if (creds?.appKey) {
    headers["X-VTEX-API-AppKey"] = creds.appKey;
  }
  if (creds?.appToken) {
    headers["X-VTEX-API-AppToken"] = creds.appToken;
  }

  return headers;
}

/**
 * Decode the `exp` (seconds since epoch) claim from a JWT without verifying it.
 * Returns null when the token isn't a parseable JWT or has no `exp`.
 */
export function jwtExpirySeconds(token: string): number | null {
  const parts = token.split(".");
  if (parts.length < 2) return null;
  try {
    const payload = parts[1].replace(/-/g, "+").replace(/_/g, "/");
    const json = atob(payload);
    const claims = JSON.parse(json) as { exp?: number };
    return typeof claims.exp === "number" ? claims.exp : null;
  } catch {
    return null;
  }
}

/**
 * Exchange App Key/Token for a VtexId session token. Throws on missing
 * credentials or a non-2xx response. Prefer `getVtexIdSessionToken` (cached)
 * unless you explicitly need a fresh token.
 */
export async function mintVtexIdSessionToken(
  creds: VTEXCredentials,
): Promise<string> {
  const { accountName, appKey, appToken } = creds;

  if (!accountName) {
    throw new Error(
      "VTEX accountName is missing — set MESH_REQUEST_CONTEXT.state.accountName.",
    );
  }
  if (!appKey || !appToken) {
    throw new Error(
      "Minting a VtexId session token requires appKey and appToken — VTEX's internal endpoints reject unauthenticated requests.",
    );
  }

  const response = await fetch(buildAppTokenLoginUrl(accountName), {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify({ appkey: appKey, apptoken: appToken }),
  });

  if (!response.ok) {
    throw new Error(
      `VTEX appToken login failed: ${response.status} - ${await response.text()}`,
    );
  }

  const data = (await response.json()) as { token?: string };
  if (!data.token) {
    throw new Error(
      "VTEX appToken login succeeded but no token was returned in the response.",
    );
  }
  return data.token;
}

interface CacheEntry {
  token: string;
  expiresAt: number;
}

// Module-scoped cache: within a worker isolate, tokens are reused across
// requests until shortly before they expire, so we don't re-login on every
// tool call. Keyed by the full credential triple so a rotated key/token never
// returns a stale session.
const sessionCache = new Map<string, CacheEntry>();

function cacheKey(creds: VTEXCredentials): string {
  return `${creds.accountName}:${creds.appKey}:${creds.appToken}`;
}

/** Test-only: clear the in-memory session cache. */
export function _clearSessionCache(): void {
  sessionCache.clear();
}

/**
 * Get a VtexId session token, reusing a cached one until it is about to expire.
 * `now` is injectable for testing.
 */
export async function getVtexIdSessionToken(
  creds: VTEXCredentials,
  opts: { now?: number } = {},
): Promise<string> {
  const now = opts.now ?? Date.now();
  const key = cacheKey(creds);

  const cached = sessionCache.get(key);
  if (cached && cached.expiresAt > now) {
    return cached.token;
  }

  const token = await mintVtexIdSessionToken(creds);
  const expSeconds = jwtExpirySeconds(token);
  const expiresAt = expSeconds
    ? expSeconds * 1000 - EXPIRY_SAFETY_MARGIN_MS
    : now + FALLBACK_TTL_MS;
  sessionCache.set(key, { token, expiresAt });
  return token;
}
