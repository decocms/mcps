/**
 * Event deduplication for Microsoft Graph notifications, backed by KV.
 *
 * Graph occasionally redelivers the same change notification (network blips,
 * subscription renewals, isolate restarts). Without dedup the agent would
 * receive the trigger twice and reply twice. We fingerprint each notification
 * and skip duplicates seen within a TTL window.
 *
 * Backed by Workers KV (not an in-memory Map) so dedup survives across the
 * ephemeral isolates that handle webhook deliveries.
 */

import { getKvStore } from "./kv.ts";

const PREFIX = "dedup:";
const DEFAULT_TTL_MS = 60 * 60 * 1000; // 1h — Graph retries within minutes

/** Build a fingerprint for a single Graph notification. */
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
 * Returns true if this fingerprint was already seen within the TTL window.
 * If new, records it (with TTL) and returns false so the caller processes it.
 */
export async function isDuplicateNotification(
  fingerprint: string,
  ttlMs: number = DEFAULT_TTL_MS,
): Promise<boolean> {
  const kv = getKvStore();
  const key = `${PREFIX}${fingerprint}`;
  const seen = await kv.get<number>(key);
  if (seen) return true;
  await kv.set(key, Date.now(), ttlMs);
  return false;
}
