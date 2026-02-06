/**
 * Key-Value Store for Slack MCP
 *
 * Persistent KV store with disk-backed storage.
 * Data survives server restarts and hot reloads.
 */

import { mkdir } from "node:fs/promises";
import { join } from "node:path";

// Configuration constants
const CLEANUP_INTERVAL = 15 * 60 * 1000; // 15 minutes
const MAX_ENTRIES = 10_000; // Maximum entries before warning

interface KVEntry<T> {
  value: T;
  expiresAt?: number;
}

interface KVStoreData {
  [key: string]: KVEntry<unknown>;
}

class KVStore {
  private store = new Map<string, KVEntry<unknown>>();
  private storePath: string;
  private saveDebounceTimer: Timer | null = null;
  private isDirty = false;

  constructor(storePath: string) {
    this.storePath = storePath;
  }

  /**
   * Initialize the store by loading data from disk
   */
  async initialize(): Promise<void> {
    try {
      // Ensure directory exists
      const dir = join(this.storePath, "..");
      await mkdir(dir, { recursive: true });

      // Try to load existing data
      const file = Bun.file(this.storePath);
      if (await file.exists()) {
        const data = (await file.json()) as KVStoreData;
        this.store = new Map(Object.entries(data));
        console.log(`[KV] 📂 Loaded ${this.store.size} entries from disk`);
      } else {
        console.log("[KV] 📂 No existing data file, starting fresh");
      }

      // Clean up expired entries on startup
      await this.cleanup();
    } catch (error) {
      console.error("[KV] ⚠️ Failed to load from disk:", error);
      // Continue with empty store if loading fails
    }
  }

  /**
   * Save store to disk (debounced to avoid excessive writes)
   */
  private async saveToDisk(): Promise<void> {
    if (!this.isDirty) return;

    try {
      const data: KVStoreData = Object.fromEntries(this.store.entries());
      await Bun.write(this.storePath, JSON.stringify(data, null, 2));
      this.isDirty = false;
      console.log(`[KV] 💾 Saved ${this.store.size} entries to disk`);
    } catch (error) {
      console.error("[KV] ⚠️ Failed to save to disk:", error);
    }
  }

  /**
   * Schedule a save (debounced)
   */
  private scheduleSave(): void {
    this.isDirty = true;

    if (this.saveDebounceTimer) {
      clearTimeout(this.saveDebounceTimer);
    }

    this.saveDebounceTimer = setTimeout(() => {
      this.saveToDisk();
    }, 1000); // Save after 1 second of inactivity
  }

  /**
   * Get a value from the store
   */
  async get<T>(key: string): Promise<T | null> {
    const entry = this.store.get(key) as KVEntry<T> | undefined;
    if (!entry) return null;

    // Check expiration
    if (entry.expiresAt && Date.now() > entry.expiresAt) {
      this.store.delete(key);
      this.scheduleSave();
      return null;
    }

    return entry.value;
  }

  /**
   * Set a value in the store
   */
  async set<T>(key: string, value: T, ttlMs?: number): Promise<void> {
    const entry: KVEntry<T> = {
      value,
      expiresAt: ttlMs ? Date.now() + ttlMs : undefined,
    };
    this.store.set(key, entry);
    this.scheduleSave();
  }

  /**
   * Delete a value from the store
   */
  async delete(key: string): Promise<boolean> {
    const deleted = this.store.delete(key);
    if (deleted) {
      this.scheduleSave();
    }
    return deleted;
  }

  /**
   * Check if a key exists
   */
  async has(key: string): Promise<boolean> {
    const value = await this.get(key);
    return value !== null;
  }

  /**
   * Get all keys matching a prefix
   */
  async keys(prefix?: string): Promise<string[]> {
    const allKeys = Array.from(this.store.keys());
    if (!prefix) return allKeys;
    return allKeys.filter((key) => key.startsWith(prefix));
  }

  /**
   * Clear expired entries and check size limits
   */
  async cleanup(): Promise<number> {
    let cleaned = 0;
    const now = Date.now();
    const sizeBefore = this.store.size;

    for (const [key, entry] of this.store.entries()) {
      if (entry.expiresAt && now > entry.expiresAt) {
        this.store.delete(key);
        cleaned++;
      }
    }

    if (cleaned > 0) {
      this.scheduleSave();
    }

    // Check size limit and warn if exceeded
    const sizeAfter = this.store.size;
    if (sizeAfter > MAX_ENTRIES) {
      console.warn(
        `[KV] ⚠️ Store size (${sizeAfter}) exceeds recommended limit (${MAX_ENTRIES}). Consider adjusting TTLs or archiving old data.`,
      );
    }

    // Log cleanup metrics if entries were cleaned
    if (cleaned > 0) {
      console.log(
        `[KV] 🧹 Cleanup: ${cleaned} expired entries removed (${sizeBefore} → ${sizeAfter})`,
      );
    }

    return cleaned;
  }

  /**
   * Get current store size (for monitoring)
   */
  getSize(): number {
    return this.store.size;
  }

  /**
   * Force immediate save to disk
   */
  async flush(): Promise<void> {
    if (this.saveDebounceTimer) {
      clearTimeout(this.saveDebounceTimer);
      this.saveDebounceTimer = null;
    }
    await this.saveToDisk();
  }
}

// Singleton instance
let kvStore: KVStore | null = null;
let initPromise: Promise<KVStore> | null = null;

export function getKvStore(): KVStore {
  if (!kvStore) {
    throw new Error(
      "[KV] Store not initialized! Call initializeKvStore() first.",
    );
  }
  return kvStore;
}

/**
 * Get store size for monitoring (safe to call before init)
 */
export function getKvStoreSize(): number {
  return kvStore?.getSize() ?? 0;
}

/**
 * Initialize the KV store with persistence
 * Must be called before using getKvStore()
 */
export async function initializeKvStore(
  storePath = "./data/slack-kv.json",
): Promise<KVStore> {
  // Return existing initialization promise if already initializing
  if (initPromise) {
    return initPromise;
  }

  // Return existing store if already initialized
  if (kvStore) {
    return kvStore;
  }

  // Initialize store
  initPromise = (async () => {
    console.log(`[KV] 🚀 Initializing persistent KV store: ${storePath}`);
    const store = new KVStore(storePath);
    await store.initialize();

    kvStore = store;

    // Auto-cleanup every 15 minutes
    setInterval(() => {
      kvStore?.cleanup();
    }, CLEANUP_INTERVAL);
    console.log(
      `[KV] 🕐 Auto-cleanup scheduled (every ${CLEANUP_INTERVAL / 1000 / 60} minutes)`,
    );

    // Graceful shutdown - flush to disk before exit
    process.on("SIGINT", async () => {
      console.log("[KV] 💾 Flushing to disk before shutdown...");
      await kvStore?.flush();
      process.exit(0);
    });

    process.on("SIGTERM", async () => {
      console.log("[KV] 💾 Flushing to disk before shutdown...");
      await kvStore?.flush();
      process.exit(0);
    });

    console.log("[KV] ✅ KV store initialized and ready");
    return store;
  })();

  return initPromise;
}
