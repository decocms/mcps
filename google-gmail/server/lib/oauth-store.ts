/**
 * OAuth state persisted in EMAIL_MAP KV.
 *
 * KV key layout (under the EMAIL_MAP namespace):
 *   pending_refresh:<sha256(access_token)> → refresh_token   (TTL ~1h)
 *   refresh:<connectionId>                  → refresh_token
 *   history:<connectionId>                  → last historyId we observed
 *
 * Why the two-step pending → claim dance: Google returns the refresh_token
 * inside `oauth.exchangeCode`, but at that point the runtime hasn't bound a
 * connectionId yet. We stash the refresh_token keyed by a hash of the
 * access_token (which we *do* see again, in `MESH_REQUEST_CONTEXT.authorization`
 * during `configuration.onChange`) and claim it from there once we know the
 * connectionId. KV TTL covers the case where the user abandons setup mid-flow.
 */

interface KVNamespaceLike {
  get(key: string): Promise<string | null>;
  put(
    key: string,
    value: string,
    options?: { expirationTtl?: number },
  ): Promise<void>;
  delete(key: string): Promise<void>;
}

const PENDING_REFRESH_PREFIX = "pending_refresh:";
const REFRESH_PREFIX = "refresh:";
const HISTORY_PREFIX = "history:";

const PENDING_TTL_SECONDS = 60 * 60; // 1h — covers slow OAuth completions

// Module-local KV reference, set per-request from the fetch handler. The
// OAuth callbacks (exchangeCode/refreshToken) are invoked by the runtime
// without an env parameter, so we have to thread the binding in via a
// side channel.
let oauthKV: KVNamespaceLike | undefined;

export function setOAuthKV(kv: KVNamespaceLike | undefined): void {
  oauthKV = kv;
}

export function getOAuthKV(): KVNamespaceLike | undefined {
  return oauthKV;
}

async function hashToken(token: string): Promise<string> {
  const buf = new TextEncoder().encode(token);
  const digest = await crypto.subtle.digest("SHA-256", buf);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

export async function stashPendingRefreshToken(
  accessToken: string,
  refreshToken: string,
): Promise<void> {
  const kv = oauthKV;
  if (!kv) return;
  const key = PENDING_REFRESH_PREFIX + (await hashToken(accessToken));
  await kv.put(key, refreshToken, { expirationTtl: PENDING_TTL_SECONDS });
}

export async function claimPendingRefreshToken(
  kv: KVNamespaceLike,
  accessToken: string,
): Promise<string | undefined> {
  const key = PENDING_REFRESH_PREFIX + (await hashToken(accessToken));
  const refreshToken = await kv.get(key);
  if (refreshToken) {
    await kv.delete(key);
  }
  return refreshToken ?? undefined;
}

export async function setRefreshTokenForConnection(
  kv: KVNamespaceLike,
  connectionId: string,
  refreshToken: string,
): Promise<void> {
  await kv.put(REFRESH_PREFIX + connectionId, refreshToken);
}

export async function getRefreshTokenForConnection(
  kv: KVNamespaceLike,
  connectionId: string,
): Promise<string | undefined> {
  const value = await kv.get(REFRESH_PREFIX + connectionId);
  return value ?? undefined;
}

export async function deleteRefreshTokenForConnection(
  kv: KVNamespaceLike,
  connectionId: string,
): Promise<void> {
  await kv.delete(REFRESH_PREFIX + connectionId);
}

export async function setLastHistoryId(
  kv: KVNamespaceLike,
  connectionId: string,
  historyId: string,
): Promise<void> {
  await kv.put(HISTORY_PREFIX + connectionId, historyId);
}

export async function getLastHistoryId(
  kv: KVNamespaceLike,
  connectionId: string,
): Promise<string | undefined> {
  const value = await kv.get(HISTORY_PREFIX + connectionId);
  return value ?? undefined;
}

export async function deleteLastHistoryId(
  kv: KVNamespaceLike,
  connectionId: string,
): Promise<void> {
  await kv.delete(HISTORY_PREFIX + connectionId);
}
