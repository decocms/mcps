/**
 * In-memory event deduplication for Microsoft Graph notifications.
 *
 * Graph occasionally redelivers the same change notification (network blips,
 * subscription renewals, mesh restarts). Without dedup, the agent would
 * receive the trigger twice and reply twice. We fingerprint each
 * notification and skip duplicates seen within a TTL window.
 *
 * Strategy:
 *  - Fingerprint = `${subscriptionId}|${changeType}|${resourceId}`
 *    (a single resource change can only happen once per (sub, type) tuple).
 *  - In-memory Map with TTL eviction on every check.
 *  - Single-pod only — for multi-pod, swap to Redis/Supabase later.
 */

const DEFAULT_TTL_MS = 60 * 60 * 1000; // 1h — Graph normally retries within minutes
const MAX_ENTRIES = 10_000;

interface DedupEntry {
  seenAt: number;
}

const cache = new Map<string, DedupEntry>();

/**
 * Build a fingerprint for a single Graph notification.
 * Uses the most stable identifying fields available.
 */
export function fingerprintNotification(notification: {
  subscriptionId: string;
  changeType: string;
  resourceData?: { id?: string };
  resource?: string;
}): string {
  const resourceId =
    notification.resourceData?.id ?? notification.resource ?? "";
  return `${notification.subscriptionId}|${notification.changeType}|${resourceId}`;
}

/**
 * Check whether we've seen this fingerprint within the TTL window.
 * If new, records it and returns false (caller should process the event).
 * If duplicate, returns true (caller should skip).
 */
export function isDuplicateNotification(
  fingerprint: string,
  ttlMs: number = DEFAULT_TTL_MS,
): boolean {
  evictExpired(ttlMs);

  const entry = cache.get(fingerprint);
  const now = Date.now();

  if (entry && now - entry.seenAt < ttlMs) {
    return true;
  }

  cache.set(fingerprint, { seenAt: now });

  // Safety cap — prevent unbounded growth if eviction lags
  if (cache.size > MAX_ENTRIES) {
    const oldestKey = cache.keys().next().value;
    if (oldestKey) cache.delete(oldestKey);
  }

  return false;
}

function evictExpired(ttlMs: number): void {
  // Cheap sampling: only scan when cache exceeds a small threshold
  if (cache.size < 100) return;
  const cutoff = Date.now() - ttlMs;
  for (const [key, entry] of cache.entries()) {
    if (entry.seenAt < cutoff) cache.delete(key);
  }
}

/** Test helper / metric — exposed for /health debug. */
export function getDedupCacheSize(): number {
  return cache.size;
}
