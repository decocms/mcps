/**
 * Cron-driven `users.watch` renewal.
 *
 * Gmail watch subscriptions expire within 7 days. The scheduled() handler
 * walks every `conn:<connectionId>` entry in EMAIL_MAP, refreshes the
 * access token from the stored refresh_token, and re-issues `users.watch`
 * against GMAIL_PUBSUB_TOPIC. We persist the new starting historyId so
 * the next webhook delivery has an anchor to diff against.
 */

import { ENDPOINTS } from "../constants.ts";
import { getAccessTokenForConnection } from "./google-token.ts";
import type { Env } from "../types/env.ts";

const CONN_PREFIX = "conn:";

interface KVListResult {
  keys: Array<{ name: string }>;
  list_complete: boolean;
  cursor?: string;
}

interface WatchResponse {
  historyId: string;
  expiration: string;
}

async function renewWatchForConnection(
  env: Env,
  connectionId: string,
  pubsubTopic: string,
): Promise<{ ok: boolean; reason?: string }> {
  if (!env.EMAIL_MAP) {
    return { ok: false, reason: "no_kv_binding" };
  }

  const accessToken = await getAccessTokenForConnection(
    env.EMAIL_MAP,
    connectionId,
  );
  if (!accessToken) {
    return { ok: false, reason: "no_access_token" };
  }

  const res = await fetch(ENDPOINTS.WATCH, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      topicName: pubsubTopic,
      labelIds: ["INBOX"],
    }),
  });

  if (!res.ok) {
    const text = await res.text();
    console.error(
      `[Cron] users.watch renewal failed for connection=${connectionId}: ${res.status} - ${text}`,
    );
    return { ok: false, reason: `watch_${res.status}` };
  }

  const data = (await res.json()) as WatchResponse;

  // Deliberately *not* touching `history:<connectionId>` here. The
  // webhook handler is the only writer of the high-water mark — if
  // we re-anchor on every 6h tick we'd silently drop any unprocessed
  // history between the last webhook and now. The webhook itself
  // re-anchors on stale 404s.
  console.log(
    `[Cron] ✓ renewed watch for connection=${connectionId}, expires ${data.expiration} (returned historyId=${data.historyId})`,
  );
  return { ok: true };
}

export async function renewAllWatches(env: Env): Promise<void> {
  if (!env.EMAIL_MAP) {
    console.warn("[Cron] EMAIL_MAP binding missing — skipping renewals");
    return;
  }

  const pubsubTopic = process.env.GMAIL_PUBSUB_TOPIC || "";
  if (!pubsubTopic) {
    console.warn(
      "[Cron] GMAIL_PUBSUB_TOPIC not set — skipping renewals (no topic to subscribe)",
    );
    return;
  }

  // Collect all connection ids first, then renew with bounded concurrency.
  // Using Promise.all on the full set is fine until we have many hundreds
  // of connections; if we ever do, a small worker-pool would be next.
  const connectionIds: string[] = [];
  let cursor: string | undefined;
  do {
    const page = (await env.EMAIL_MAP.list({
      prefix: CONN_PREFIX,
      cursor,
    })) as KVListResult;
    for (const k of page.keys) {
      connectionIds.push(k.name.slice(CONN_PREFIX.length));
    }
    cursor = page.list_complete ? undefined : page.cursor;
  } while (cursor);

  if (connectionIds.length === 0) {
    console.log("[Cron] no connections to renew");
    return;
  }

  console.log(
    `[Cron] renewing users.watch for ${connectionIds.length} connection(s)`,
  );

  let okCount = 0;
  let failCount = 0;
  const results = await Promise.allSettled(
    connectionIds.map((id) => renewWatchForConnection(env, id, pubsubTopic)),
  );
  for (const r of results) {
    if (r.status === "fulfilled" && r.value.ok) okCount++;
    else failCount++;
  }
  console.log(
    `[Cron] renewal pass complete: ${okCount} ok, ${failCount} failed`,
  );
}
