/**
 * Persistent Config Cache - Supabase, Redis or KV Store
 *
 * Single source of truth for connection configurations.
 *
 * Storage Strategy (priority order):
 * 1. **Supabase** (SUPABASE_URL + SUPABASE_ANON_KEY): Production multi-pod (recommended!)
 * 2. **Redis** (REDIS_URL): Alternative for multi-pod
 * 3. **KV Store**: Fallback for single-pod or local development
 *
 * Flow:
 * 1. onChange (MCP context) → saves config to Supabase/Redis/KV
 * 2. Webhook router → reads from Supabase/Redis/KV
 * 3. Multi-pod → Supabase/Redis ensures all pods see same config
 * 4. Single-pod → KV store on disk works fine
 */

import { getKvStore } from "./kv.ts";
import { getRedisStore, isRedisInitialized } from "./redis-store.ts";
import {
  isSupabaseConfigured,
  saveConnectionConfig as supabaseSaveConfig,
  loadConnectionConfig as supabaseLoadConfig,
  deleteConnectionConfig as supabaseDeleteConfig,
  countConnections as supabaseCountConnections,
} from "./supabase-client.ts";

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
  hyperDxApiKey?: string;
  responseConfig?: {
    showOnlyFinalResponse?: boolean;
    enableStreaming?: boolean;
    showThinkingMessage?: boolean;
  };
  configuredAt?: string;
  updatedAt?: string;
}

/**
 * Save config to persistent storage (Database > Redis > KV)
 */
export async function cacheConnectionConfig(
  config: ConnectionConfig,
): Promise<void> {
  const key = `${CONFIG_PREFIX}${config.connectionId}`;

  // Check if this is a new entry
  const existing = await _getConfig(key);
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

  // Save to appropriate storage (priority: Supabase > Redis > KV)
  if (isSupabaseConfigured()) {
    try {
      await supabaseSaveConfig(configWithTimestamps);
      console.log(
        `[ConfigCache] 💾 Cached config for ${config.connectionId} (Supabase, total: ${configCacheCount})`,
      );
    } catch (error) {
      console.error(
        "[ConfigCache] ❌ Supabase save failed, falling back to Redis/KV:",
        error,
      );
      // Fallback to Redis/KV on Supabase error
      await _saveToRedisOrKV(key, configWithTimestamps);
    }
  } else {
    await _saveToRedisOrKV(key, configWithTimestamps);
  }
}

/**
 * Save to Redis or KV (fallback)
 */
async function _saveToRedisOrKV(
  key: string,
  config: ConnectionConfig,
): Promise<void> {
  if (isRedisInitialized()) {
    const redis = getRedisStore();
    await redis.set(key, config);
    console.log(
      `[ConfigCache] 💾 Cached config for ${config.connectionId} (Redis, total: ${configCacheCount})`,
    );
  } else {
    const kv = getKvStore();
    await kv.set(key, config);
    console.log(
      `[ConfigCache] 💾 Cached config for ${config.connectionId} (KV Store, total: ${configCacheCount})`,
    );
  }
}

/**
 * Internal helper to get config from Supabase, Redis or KV
 */
async function _getConfig(key: string): Promise<ConnectionConfig | null> {
  // Extract connection ID from key
  const connectionId = key.replace(CONFIG_PREFIX, "");

  // Try Supabase first
  if (isSupabaseConfigured()) {
    try {
      const config = await supabaseLoadConfig(connectionId);
      if (config) return config;
    } catch (error) {
      console.error(
        "[ConfigCache] ❌ Supabase load failed, falling back to Redis/KV:",
        error,
      );
    }
  }

  // Fallback to Redis
  if (isRedisInitialized()) {
    const redis = getRedisStore();
    return await redis.get<ConnectionConfig>(key);
  }

  // Fallback to KV
  const kv = getKvStore();
  return (await kv.get(key)) as ConnectionConfig | null;
}

/**
 * Read config from persistent storage (used by webhook router)
 */
export async function getCachedConnectionConfig(
  connectionId: string,
): Promise<ConnectionConfig | null> {
  const key = `${CONFIG_PREFIX}${connectionId}`;
  return await _getConfig(key);
}

/**
 * Remove config from cache
 */
export async function removeCachedConnectionConfig(
  connectionId: string,
): Promise<void> {
  const key = `${CONFIG_PREFIX}${connectionId}`;
  const existing = await _getConfig(key);

  if (existing) {
    // Remove from all storage layers
    if (isSupabaseConfigured()) {
      try {
        await supabaseDeleteConfig(connectionId);
        console.log(
          `[ConfigCache] 🗑️ Removed cached config for ${connectionId} (Supabase, remaining: ${--configCacheCount})`,
        );
      } catch (error) {
        console.error("[ConfigCache] ❌ Supabase delete failed:", error);
      }
    }

    if (isRedisInitialized()) {
      const redis = getRedisStore();
      await redis.delete(key);
    }

    const kv = getKvStore();
    await kv.delete(key);
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
 * Initialize cache count from storage on startup
 */
export async function initializeConfigCacheCount(): Promise<void> {
  try {
    if (isSupabaseConfigured()) {
      try {
        configCacheCount = await supabaseCountConnections();
        console.log(
          `[ConfigCache] Initialized count from Supabase: ${configCacheCount} configs`,
        );
        return;
      } catch (error) {
        console.error("[ConfigCache] Error counting from Supabase:", error);
      }
    }

    if (isRedisInitialized()) {
      const redis = getRedisStore();
      const keys = await redis.keys(`${CONFIG_PREFIX}*`);
      configCacheCount = keys.length;
      console.log(
        `[ConfigCache] Initialized count from Redis: ${configCacheCount} configs`,
      );
    } else {
      // For KV Store, count starts at 0 and increments as configs are saved
      configCacheCount = 0;
      console.log(
        "[ConfigCache] Initialized count from KV Store: starting at 0",
      );
    }
  } catch (error) {
    console.error("[ConfigCache] Error initializing cache count:", error);
    configCacheCount = 0;
  }
}
