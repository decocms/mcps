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
 * For webhook handlers (no MESH request context, so we can't read
 * MESH_REQUEST_CONTEXT.authorization). Reads an access token cached by
 * SUBSCRIBE_TO_CHANNEL / REFRESH_SUBSCRIPTIONS.
 *
 * Throws if the cache is missing or expired — the agent must call
 * REFRESH_SUBSCRIPTIONS to reseed the cache (and renew the Graph
 * subscription itself, which expires every ~60 min anyway).
 */
export async function getDelegatedTokenForConnection(
  connectionId: string,
): Promise<string> {
  const kv = getKvStore();
  const cached = await kv.get<{ accessToken: string; expiresAt: number }>(
    `webhook-token:${connectionId}`,
  );

  if (!cached) {
    throw new Error(
      `No cached webhook token for connection ${connectionId}. ` +
        `Call SUBSCRIBE_TO_CHANNEL or REFRESH_SUBSCRIPTIONS to seed it.`,
    );
  }

  if (Date.now() > cached.expiresAt - 60_000) {
    throw new Error(
      `Webhook token for connection ${connectionId} is expired. ` +
        `Call REFRESH_SUBSCRIPTIONS to renew.`,
    );
  }

  return cached.accessToken;
}
