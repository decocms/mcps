/**
 * Stateless helper to exchange a stored refresh_token for a fresh
 * access_token, used from contexts that don't have a MESH_REQUEST_CONTEXT
 * (Pub/Sub webhook, scheduled cron handler).
 *
 * Reads GOOGLE_CLIENT_ID/GOOGLE_CLIENT_SECRET from process.env (populated
 * by wrangler secrets under nodejs_compat).
 */

import {
  getRefreshTokenForConnection,
  setRefreshTokenForConnection,
} from "./oauth-store.ts";

interface KVNamespaceLike {
  get(key: string): Promise<string | null>;
  put(key: string, value: string): Promise<void>;
  delete(key: string): Promise<void>;
}

const TOKEN_ENDPOINT = "https://oauth2.googleapis.com/token";

export interface AccessTokenResult {
  accessToken: string;
  expiresIn: number;
}

export async function refreshAccessToken(
  refreshToken: string,
): Promise<AccessTokenResult | null> {
  const clientId = process.env.GOOGLE_CLIENT_ID || "";
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET || "";
  if (!clientId || !clientSecret) {
    console.error(
      "[GoogleToken] GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET not set — cannot refresh",
    );
    return null;
  }

  const params = new URLSearchParams({
    refresh_token: refreshToken,
    client_id: clientId,
    client_secret: clientSecret,
    grant_type: "refresh_token",
  });

  const res = await fetch(TOKEN_ENDPOINT, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: params,
  });

  if (!res.ok) {
    const text = await res.text();
    console.error(
      `[GoogleToken] refresh_token exchange failed: ${res.status} - ${text}`,
    );
    return null;
  }

  const data = (await res.json()) as {
    access_token: string;
    expires_in: number;
    refresh_token?: string;
  };

  return {
    accessToken: data.access_token,
    expiresIn: data.expires_in,
  };
}

/**
 * Resolve a fresh Google access_token for a connection. Returns null if
 * no refresh_token is stored or the refresh fails (e.g. user revoked
 * access). Callers should treat null as "skip this delivery / log and
 * move on" rather than crashing.
 *
 * If Google rotates the refresh_token (rare but possible when refresh
 * token rotation is enabled on the OAuth client), the new token is
 * persisted before the access token is returned.
 */
export async function getAccessTokenForConnection(
  kv: KVNamespaceLike,
  connectionId: string,
): Promise<string | null> {
  const refreshToken = await getRefreshTokenForConnection(kv, connectionId);
  if (!refreshToken) {
    return null;
  }

  const clientId = process.env.GOOGLE_CLIENT_ID || "";
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET || "";
  if (!clientId || !clientSecret) {
    console.error(
      "[GoogleToken] GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET not set",
    );
    return null;
  }

  const params = new URLSearchParams({
    refresh_token: refreshToken,
    client_id: clientId,
    client_secret: clientSecret,
    grant_type: "refresh_token",
  });

  const res = await fetch(TOKEN_ENDPOINT, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: params,
  });

  if (!res.ok) {
    const text = await res.text();
    console.error(
      `[GoogleToken] refresh failed for connection=${connectionId}: ${res.status} - ${text}`,
    );
    return null;
  }

  const data = (await res.json()) as {
    access_token: string;
    expires_in: number;
    refresh_token?: string;
  };

  if (data.refresh_token && data.refresh_token !== refreshToken) {
    await setRefreshTokenForConnection(kv, connectionId, data.refresh_token);
  }

  return data.access_token;
}
