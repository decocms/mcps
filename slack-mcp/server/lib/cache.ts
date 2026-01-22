/**
 * Simple TTL-based Cache
 *
 * In-memory cache with automatic expiration for API responses.
 */

interface CacheEntry<T> {
  data: T;
  expires: number;
}

const cache = new Map<string, CacheEntry<unknown>>();

/**
 * Get a cached value if it exists and hasn't expired
 */
export function getCached<T>(key: string): T | null {
  const entry = cache.get(key) as CacheEntry<T> | undefined;

  if (!entry) {
    return null;
  }

  if (Date.now() > entry.expires) {
    cache.delete(key);
    return null;
  }

  return entry.data;
}

/**
 * Set a value in the cache with TTL
 */
export function setCache<T>(key: string, data: T, ttlMs: number): void {
  cache.set(key, {
    data,
    expires: Date.now() + ttlMs,
  });
}

/**
 * Delete a specific cache entry
 */
export function deleteCache(key: string): void {
  cache.delete(key);
}

/**
 * Delete all cache entries matching a prefix
 */
export function deleteCacheByPrefix(prefix: string): void {
  for (const key of cache.keys()) {
    if (key.startsWith(prefix)) {
      cache.delete(key);
    }
  }
}

/**
 * Clear the entire cache
 */
export function clearCache(): void {
  cache.clear();
}

/**
 * Get cache statistics
 */
export function getCacheStats(): { size: number; keys: string[] } {
  return {
    size: cache.size,
    keys: Array.from(cache.keys()),
  };
}

/**
 * Helper: Get or fetch with caching
 */
export async function getOrFetch<T>(
  key: string,
  fetcher: () => Promise<T>,
  ttlMs: number,
): Promise<T> {
  const cached = getCached<T>(key);
  if (cached !== null) {
    console.log(`[Cache] HIT: ${key}`);
    return cached;
  }

  console.log(`[Cache] MISS: ${key}`);
  const data = await fetcher();
  setCache(key, data, ttlMs);
  return data;
}

/**
 * Cache key generators for consistency
 */
export const CacheKeys = {
  channels: () => "slack:channels",
  users: () => "slack:users",
  user: (userId: string) => `slack:user:${userId}`,
  channel: (channelId: string) => `slack:channel:${channelId}`,
} as const;
