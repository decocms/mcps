/**
 * Persistent KV store backed by a JSON file on disk.
 * Identical pattern to the Slack MCP KV store.
 */

import { mkdir } from "node:fs/promises";
import { join } from "node:path";

const CLEANUP_INTERVAL = 15 * 60 * 1000;

interface KVEntry<T> {
  value: T;
  expiresAt?: number;
}

type KVStoreData = Record<string, KVEntry<unknown>>;

class KVStore {
  private store = new Map<string, KVEntry<unknown>>();
  private storePath: string;
  private saveTimer: Timer | null = null;
  private dirty = false;

  constructor(storePath: string) {
    this.storePath = storePath;
  }

  async initialize(): Promise<void> {
    try {
      await mkdir(join(this.storePath, ".."), { recursive: true });
      const file = Bun.file(this.storePath);
      if (await file.exists()) {
        const data = (await file.json()) as KVStoreData;
        this.store = new Map(Object.entries(data));
        console.log(`[KV] Loaded ${this.store.size} entries`);
      }
      await this.cleanup();
    } catch (err) {
      console.error("[KV] Failed to load:", err);
    }
  }

  private async saveToDisk(): Promise<void> {
    if (!this.dirty) return;
    try {
      const data: KVStoreData = Object.fromEntries(this.store.entries());
      await Bun.write(this.storePath, JSON.stringify(data, null, 2));
      this.dirty = false;
    } catch (err) {
      console.error("[KV] Failed to save:", err);
    }
  }

  private scheduleSave(): void {
    this.dirty = true;
    if (this.saveTimer) clearTimeout(this.saveTimer);
    this.saveTimer = setTimeout(() => this.saveToDisk(), 1000);
  }

  async get<T>(key: string): Promise<T | null> {
    const entry = this.store.get(key) as KVEntry<T> | undefined;
    if (!entry) return null;
    if (entry.expiresAt && Date.now() > entry.expiresAt) {
      this.store.delete(key);
      this.scheduleSave();
      return null;
    }
    return entry.value;
  }

  async set<T>(key: string, value: T, ttlMs?: number): Promise<void> {
    this.store.set(key, {
      value,
      expiresAt: ttlMs ? Date.now() + ttlMs : undefined,
    });
    this.scheduleSave();
  }

  async delete(key: string): Promise<boolean> {
    const deleted = this.store.delete(key);
    if (deleted) this.scheduleSave();
    return deleted;
  }

  async keys(prefix?: string): Promise<string[]> {
    const all = Array.from(this.store.keys());
    return prefix ? all.filter((k) => k.startsWith(prefix)) : all;
  }

  async cleanup(): Promise<void> {
    const now = Date.now();
    for (const [key, entry] of this.store.entries()) {
      if (entry.expiresAt && now > entry.expiresAt) this.store.delete(key);
    }
  }

  async flush(): Promise<void> {
    if (this.saveTimer) {
      clearTimeout(this.saveTimer);
      this.saveTimer = null;
    }
    await this.saveToDisk();
  }
}

let kvStore: KVStore | null = null;

export function getKvStore(): KVStore {
  if (!kvStore)
    throw new Error("[KV] Not initialized. Call initializeKvStore() first.");
  return kvStore;
}

export async function initializeKvStore(
  storePath = "./data/teams-kv.json",
): Promise<void> {
  if (kvStore) return;
  console.log(`[KV] Initializing: ${storePath}`);
  const store = new KVStore(storePath);
  await store.initialize();
  kvStore = store;

  setInterval(() => kvStore?.cleanup(), CLEANUP_INTERVAL);

  process.on("SIGINT", async () => {
    await kvStore?.flush();
    process.exit(0);
  });
  process.on("SIGTERM", async () => {
    await kvStore?.flush();
    process.exit(0);
  });
}
