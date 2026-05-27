/**
 * Recent-events log for debugging the trigger pipeline.
 *
 * Every time the MCP publishes a trigger to subscribed agents, it ALSO
 * records the payload in the KV under `event:{connectionId}:{ts}-{rand}`.
 * Each entry has a 24h TTL so the store stays bounded.
 *
 * Lets you answer "did the webhook fire?" / "what did the agent receive?"
 * from a tool call without grepping bun logs.
 */

import { getKvStore } from "./kv.ts";

const PREFIX = "event:";
const TTL_MS = 24 * 60 * 60 * 1000; // 24h
const MAX_PER_CONNECTION = 200; // soft cap — pruned on write

export interface LoggedEvent {
  ts: string; // ISO timestamp
  connectionId: string;
  event_type: string;
  trace_id?: string;
  payload: Record<string, unknown>;
}

function eventKey(connectionId: string, ts: number): string {
  return `${PREFIX}${connectionId}:${ts}-${Math.random().toString(36).slice(2, 8)}`;
}

/** Append an event to the per-connection log. Non-blocking — best effort. */
export async function logEvent(
  connectionId: string,
  event_type: string,
  payload: Record<string, unknown>,
  trace_id?: string,
): Promise<void> {
  try {
    const kv = getKvStore();
    const entry: LoggedEvent = {
      ts: new Date().toISOString(),
      connectionId,
      event_type,
      trace_id,
      payload,
    };
    await kv.set(eventKey(connectionId, Date.now()), entry, TTL_MS);
    await pruneIfOverCap(connectionId);
  } catch {
    // never throw from the log layer
  }
}

/**
 * Return up to `top` most-recent events for a connection (newest first).
 * Optional `event_type` filter narrows the result (e.g. "teams.message.received").
 */
export async function getRecentEvents(
  connectionId: string,
  top: number = 20,
  event_type?: string,
): Promise<LoggedEvent[]> {
  const kv = getKvStore();
  const keys = await kv.keys(`${PREFIX}${connectionId}:`);
  // Keys end in `{ts}-{rand}` → sort lexicographically ≈ chronological
  keys.sort().reverse();

  const events: LoggedEvent[] = [];
  for (const key of keys) {
    if (events.length >= top) break;
    const ev = await kv.get<LoggedEvent>(key);
    if (!ev) continue;
    if (event_type && ev.event_type !== event_type) continue;
    events.push(ev);
  }
  return events;
}

/** Wipe all logged events for a connection. */
export async function clearEvents(connectionId: string): Promise<number> {
  const kv = getKvStore();
  const keys = await kv.keys(`${PREFIX}${connectionId}:`);
  let deleted = 0;
  for (const key of keys) {
    if (await kv.delete(key)) deleted++;
  }
  return deleted;
}

async function pruneIfOverCap(connectionId: string): Promise<void> {
  const kv = getKvStore();
  const keys = await kv.keys(`${PREFIX}${connectionId}:`);
  if (keys.length <= MAX_PER_CONNECTION) return;
  // Delete the oldest (keys sort chronologically → oldest = first after sort)
  keys.sort();
  const toDelete = keys.slice(0, keys.length - MAX_PER_CONNECTION);
  for (const key of toDelete) await kv.delete(key);
}
