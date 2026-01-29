/**
 * Persistent Config Cache using KV Store
 *
 * Single source of truth for connection configurations.
 * Uses KV store with disk persistence - survives server restarts!
 *
 * Flow:
 * 1. onChange (MCP context) → saves config to KV store
 * 2. Webhook router → reads from KV store
 * 3. Single-pod deployment → KV store on disk is all we need
 */

import { getKvStore } from "./kv.ts";

const CONFIG_PREFIX = "config:";

/**
 * Connection configuration stored in KV
 */
export interface ConnectionConfig {
  connectionId: string;
  organizationId: string;
  meshUrl: string;
  meshToken?: string;
  modelProviderId?: string;
  modelId?: string;
  agentId?: string;
  systemPrompt?: string;
  botToken: string;
  signingSecret: string;
  teamId?: string;
  teamName?: string;
  botUserId?: string;
  connectionName?: string;
  responseConfig?: {
    showOnlyFinalResponse?: boolean;
    enableStreaming?: boolean;
    showThinkingMessage?: boolean;
  };
  configuredAt?: string;
  updatedAt?: string;
}

/**
 * Save config to persistent KV store
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

  // Add timestamps
  const configWithTimestamps = {
    ...config,
    updatedAt: new Date().toISOString(),
    configuredAt: existing
      ? (existing as ConnectionConfig).configuredAt
      : new Date().toISOString(),
  };

  await kv.set(key, configWithTimestamps);
  console.log(
    `[ConfigCache] 💾 Cached config for ${config.connectionId} (persistent, total: ${configCacheCount})`,
  );
}

/**
 * Read config from persistent KV store (used by webhook router)
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
 * Initialize cache count from KV store on startup
 */
export async function initializeConfigCacheCount(): Promise<void> {
  // Note: This would require iterating KV keys
  // For now, count will start at 0 and increment as configs are saved
  configCacheCount = 0;
}
