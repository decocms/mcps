/**
 * Persistent Config Cache using KV Store
 *
 * Bridge between MCP context (has DATABASE binding) and webhook router (no MCP context).
 * Uses KV store for persistence - survives server restarts!
 *
 * Flow:
 * 1. onChange (MCP context) → saves to DATABASE binding → saves to KV cache
 * 2. Webhook router → reads from KV cache (survives restarts!)
 * 3. Multi-pod K8s → DATABASE binding is source of truth, KV is per-pod cache
 */

import type { ConnectionConfig } from "./db-sql.ts";
import { getKvStore } from "./kv.ts";

const CONFIG_PREFIX = "config:";

/**
 * Save config to persistent KV cache (called from onChange after DATABASE save)
 */
export async function cacheConnectionConfig(
  config: ConnectionConfig,
): Promise<void> {
  const kv = getKvStore();
  const key = `${CONFIG_PREFIX}${config.connectionId}`;

  // Check if this is a new entry
  const existing = await kv.get(key);
  if (!existing) {
    configCacheCount++;
  }

  await kv.set(key, config);
  console.log(
    `[ConfigCache] 💾 Cached config for ${config.connectionId} (persistent, total: ${configCacheCount})`,
  );
}

/**
 * Read config from persistent KV cache (used by webhook router)
 */
export async function getCachedConnectionConfig(
  connectionId: string,
): Promise<ConnectionConfig | null> {
  const kv = getKvStore();
  const key = `${CONFIG_PREFIX}${connectionId}`;
  return (await kv.get(key)) as ConnectionConfig | null;
}

/**
 * Remove config from cache
 */
export async function removeCachedConnectionConfig(
  connectionId: string,
): Promise<void> {
  const kv = getKvStore();
  const key = `${CONFIG_PREFIX}${connectionId}`;
  const existing = await kv.get(key);
  if (existing) {
    await kv.delete(key);
    configCacheCount--;
    console.log(
      `[ConfigCache] 🗑️ Removed cached config for ${connectionId} (persistent, remaining: ${configCacheCount})`,
    );
  }
}

// In-memory counter for config entries (for health checks)
let configCacheCount = 0;

/**
 * Get cache size for health checks
 */
export function getConfigCacheSize(): number {
  return configCacheCount;
}

/**
 * List all cached connection IDs (not implemented - would require iterating KV)
 */
export function listCachedConnectionIds(): string[] {
  // Note: KVStore doesn't expose keys iteration
  // For now, return empty array. Could be implemented by tracking IDs separately.
  return [];
}
