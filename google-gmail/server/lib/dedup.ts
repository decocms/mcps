/**
 * Per-message delivery dedup, backed by EMAIL_MAP KV.
 *
 * KV layout:
 *   processed:<connectionId>:<messageId> → status (TTL 7d)
 *
 * Writers mark a message as `delivered` (mesh callback returned ok) or
 * `skipped` (we filtered it out before delivery, e.g. not in INBOX).
 * Either status causes future webhook deliveries to skip the message,
 * which prevents duplicate firings when Pub/Sub fans the same mailbox
 * change out across multiple parallel push deliveries.
 *
 * Race window: two webhooks can both `kv.get` null for the same key
 * before either writes back. KV doesn't expose put-if-absent, so this
 * is the smallest fix that doesn't require Durable Objects. In
 * practice the window is single-digit milliseconds and the race
 * requires Pub/Sub to deliver two separate notifications whose history
 * windows happen to overlap — rare. We accept rare duplicate
 * deliveries; a workflow that needs strict exactly-once should idem-
 * potize on `messageId`.
 *
 * Gmail history retention is ~7 days, so a TTL of 7d means we don't
 * grow KV indefinitely while still covering the entire window the
 * user could replay across.
 */

interface KVNamespaceLike {
  get(key: string): Promise<string | null>;
  put(
    key: string,
    value: string,
    options?: { expirationTtl?: number },
  ): Promise<void>;
}

const PREFIX = "processed:";
const TTL_SECONDS = 7 * 24 * 60 * 60; // 7 days, matches Gmail history retention

export type ProcessedStatus = "delivered" | "skipped";

function key(connectionId: string, messageId: string): string {
  return `${PREFIX}${connectionId}:${messageId}`;
}

export async function isMessageProcessed(
  kv: KVNamespaceLike,
  connectionId: string,
  messageId: string,
): Promise<boolean> {
  const v = await kv.get(key(connectionId, messageId));
  return v !== null;
}

export async function markMessageProcessed(
  kv: KVNamespaceLike,
  connectionId: string,
  messageId: string,
  status: ProcessedStatus,
): Promise<void> {
  await kv.put(key(connectionId, messageId), status, {
    expirationTtl: TTL_SECONDS,
  });
}
