/**
 * OAuth state persisted in EMAIL_MAP KV.
 *
 * KV key layout (under the EMAIL_MAP namespace):
 *   pending_refresh:<emailAddress> → refresh_token   (TTL ~24h)
 *   refresh:<connectionId>          → refresh_token
 *   history:<connectionId>          → last historyId we observed
 *
 * Why the two-step pending → claim dance: Google returns the refresh_token
 * inside `oauth.exchangeCode`, but at that point the runtime hasn't bound a
 * connectionId yet. We stash the refresh_token keyed by the user's Gmail
 * address (which we look up via the profile API at exchangeCode time, since
 * the access_token Google just gave us is freshly valid). Setup later calls
 * the profile API too — same email — and claims the entry. Keying by email
 * survives mesh refreshing the access_token between exchangeCode and the
 * first observed tool call (an earlier hash-of-access_token scheme silently
 * lost the claim in that case).
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

const PENDING_TTL_SECONDS = 24 * 60 * 60; // 24h

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

function pendingKey(email: string): string {
  return PENDING_REFRESH_PREFIX + email.toLowerCase();
}

export async function stashPendingRefreshToken(
  email: string,
  refreshToken: string,
): Promise<void> {
  const kv = oauthKV;
  if (!kv) return;
  await kv.put(pendingKey(email), refreshToken, {
    expirationTtl: PENDING_TTL_SECONDS,
  });
}

export async function claimPendingRefreshToken(
  kv: KVNamespaceLike,
  email: string,
): Promise<string | undefined> {
  const k = pendingKey(email);
  const refreshToken = await kv.get(k);
  if (refreshToken) {
    await kv.delete(k);
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
