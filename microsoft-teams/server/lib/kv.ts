/**
 * KV store backed by a Cloudflare Workers KV namespace.
 *
 * Workers isolates are ephemeral, so we cannot use an in-memory Map or the
 * filesystem. The KV binding is per-request, but this module is a singleton —
 * we thread the current binding in via `setKvNamespace()` at the top of the
 * Worker fetch handler (safe because all concurrent requests on the same
 * isolate share the same env/bindings).
 *
 * The adapter keeps the previous get/set/delete/keys interface so callers
 * (trigger-store, event-log, subscriptions, auth, dedup) stay unchanged.
 * Values are JSON-serialized; `ttlMs` maps to KV's `expirationTtl` (seconds,
 * minimum 60s — values below are clamped up).
 */

import type { KVNamespace } from "../types/env.ts";

let namespace: KVNamespace | undefined;

/** Wire the per-request KV binding into the module singleton. */
export function setKvNamespace(ns: KVNamespace | undefined): void {
  namespace = ns;
}

function requireNs(): KVNamespace {
  if (!namespace) {
    throw new Error(
      "[KV] No KV namespace bound. Ensure setKvNamespace(env.TEAMS_KV) runs at " +
        "the top of the fetch handler and that TEAMS_KV is configured in wrangler.toml.",
    );
  }
  return namespace;
}

class KvStore {
  async get<T>(key: string): Promise<T | null> {
    const raw = await requireNs().get(key);
    if (raw === null) return null;
    try {
      return JSON.parse(raw) as T;
    } catch {
      return null;
    }
  }

  async set<T>(key: string, value: T, ttlMs?: number): Promise<void> {
    const opts =
      ttlMs && ttlMs > 0
        ? { expirationTtl: Math.max(60, Math.ceil(ttlMs / 1000)) }
        : undefined;
    await requireNs().put(key, JSON.stringify(value), opts);
  }

  async delete(key: string): Promise<boolean> {
    await requireNs().delete(key);
    return true;
  }

  /** List all keys (optionally by prefix), paginating through KV cursors. */
  async keys(prefix?: string): Promise<string[]> {
    const ns = requireNs();
    const out: string[] = [];
    let cursor: string | undefined;
    do {
      const res = await ns.list({ prefix, cursor });
      for (const k of res.keys) out.push(k.name);
      cursor = res.list_complete ? undefined : res.cursor;
    } while (cursor);
    return out;
  }
}

const store = new KvStore();

/** Returns the KV store adapter. Requires setKvNamespace() to have run. */
export function getKvStore(): KvStore {
  return store;
}
