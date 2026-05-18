/**
 * Token accessor for the Microsoft Teams MCP.
 *
 * The deco runtime handles the entire OAuth flow (authorize, exchange,
 * refresh) — the per-request bearer token arrives in
 * `env.MESH_REQUEST_CONTEXT.authorization`. We just pull it out here.
 *
 * For webhook handlers that run *outside* a tool request (no MESH context),
 * use getDelegatedTokenForConnection() with a stored refresh token.
 */

import type { Env } from "../types/env.ts";
import { getKvStore } from "./kv.ts";
import { exchangeRefreshToken } from "./oauth.ts";

/** Pull the user's bearer token off the per-request mesh context. */
export function getAccessToken(env: Env): string {
  const auth = env.MESH_REQUEST_CONTEXT?.authorization;
  if (!auth) {
    throw new Error(
      "Missing authorization. Click 'Connect to Microsoft' in deco Studio first.",
    );
  }
  // Authorization header may come as "Bearer <token>" or just "<token>"
  return auth.startsWith("Bearer ") ? auth.slice(7) : auth;
}

/**
 * For webhook handlers (Graph notifications) — no MESH context available.
 * Reads a refresh token cached per-connection in KV and exchanges it for
 * a fresh access token. Requires that the connection has been set up via
 * a tool call first (so the refresh token was stored).
 */
export async function getDelegatedTokenForConnection(
  connectionId: string,
): Promise<string> {
  const kv = getKvStore();
  const stored = await kv.get<{
    accessToken: string;
    refreshToken: string;
    tokenExpiresAt: number;
    tenantId: string;
    clientId: string;
    clientSecret: string;
  }>(`webhook-token:${connectionId}`);

  if (!stored?.refreshToken) {
    throw new Error(
      `No webhook token cached for connection ${connectionId}. ` +
        `Call any tool from this connection first to seed the cache.`,
    );
  }

  const now = Date.now();
  if (stored.accessToken && now < stored.tokenExpiresAt - 60_000) {
    return stored.accessToken;
  }

  const tokens = await exchangeRefreshToken(
    stored.tenantId,
    stored.clientId,
    stored.clientSecret,
    stored.refreshToken,
  );

  await kv.set(`webhook-token:${connectionId}`, {
    ...stored,
    accessToken: tokens.access_token,
    refreshToken: tokens.refresh_token ?? stored.refreshToken,
    tokenExpiresAt: now + tokens.expires_in * 1000,
  });

  return tokens.access_token;
}
