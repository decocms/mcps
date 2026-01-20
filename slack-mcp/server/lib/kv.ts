/**
 * Key-Value Store for Slack MCP
 *
 * Simple in-memory KV store with TTL support.
 * In production, this could be backed by Redis, KV, or similar.
 */

interface KVEntry<T> {
  value: T;
  expiresAt?: number;
}

class KVStore {
  private store = new Map<string, KVEntry<unknown>>();

  /**
   * Get a value from the store
   */
  async get<T>(key: string): Promise<T | null> {
    const entry = this.store.get(key) as KVEntry<T> | undefined;
    if (!entry) return null;

    // Check expiration
    if (entry.expiresAt && Date.now() > entry.expiresAt) {
      this.store.delete(key);
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
  }

  /**
   * Delete a value from the store
   */
  async delete(key: string): Promise<boolean> {
    return this.store.delete(key);
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
   * Clear expired entries
   */
  async cleanup(): Promise<number> {
    let cleaned = 0;
    const now = Date.now();

    for (const [key, entry] of this.store.entries()) {
      if (entry.expiresAt && now > entry.expiresAt) {
        this.store.delete(key);
        cleaned++;
      }
    }

    return cleaned;
  }
}

// Singleton instance
let kvStore: KVStore | null = null;

export function getKvStore(): KVStore {
  if (!kvStore) {
    kvStore = new KVStore();

    // Auto-cleanup every 5 minutes
    setInterval(
      () => {
        kvStore?.cleanup().then((count) => {
          if (count > 0) {
            console.log(`[KV] Cleaned up ${count} expired entries`);
          }
        });
      },
      5 * 60 * 1000,
    );
  }
  return kvStore;
}
