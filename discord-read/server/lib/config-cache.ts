/**
 * Discord Configuration Cache
 *
 * Similar to Slack MCP, caches Discord bot configurations in memory
 * with Supabase as the persistent store.
 */

import {
  loadConnectionConfig,
  saveConnectionConfig,
  deleteConnectionConfig,
  type DiscordConnectionRow,
} from "./supabase-client.ts";

/**
 * Discord connection configuration
 */
export interface DiscordConfig {
  connectionId: string;
  organizationId: string;
  meshUrl: string;
  meshToken?: string; // Session token (expires in ~5 min)
  meshApiKey?: string; // Persistent API key (never expires) - PREFERRED
  modelProviderId?: string;
  modelId?: string;
  agentId?: string;
  systemPrompt?: string;
  botToken: string;
  discordPublicKey?: string; // Discord application public key (for webhook verification)
  authorizedGuilds?: string[]; // List of guild IDs that can use this bot
  ownerId?: string; // Discord user ID of the bot owner
  commandPrefix?: string; // Command prefix (default: "!")
  configuredAt?: string;
  updatedAt?: string;
}

/**
 * Get the effective Mesh token for API calls
 * Prefers API key (never expires) over session token (expires)
 */
export function getEffectiveMeshToken(
  config: DiscordConfig,
): string | undefined {
  // Prefer API key (persistent, never expires)
  if (config.meshApiKey) {
    return config.meshApiKey;
  }
  // Fallback to session token (may expire)
  return config.meshToken;
}

/**
 * In-memory cache (30 second TTL)
 */
interface CacheEntry {
  config: DiscordConfig;
  timestamp: number;
}

const cache = new Map<string, CacheEntry>();
const CACHE_TTL_MS = 30_000; // 30 seconds

/**
 * Get Discord configuration from cache or Supabase
 */
export async function getDiscordConfig(
  connectionId: string,
): Promise<DiscordConfig | null> {
  // Check cache first
  const cached = cache.get(connectionId);
  if (cached && Date.now() - cached.timestamp < CACHE_TTL_MS) {
    return cached.config;
  }

  // Load from Supabase
  const row = await loadConnectionConfig(connectionId);
  if (!row) {
    cache.delete(connectionId);
    return null;
  }

  const config: DiscordConfig = {
    connectionId: row.connection_id,
    organizationId: row.organization_id,
    meshUrl: row.mesh_url,
    meshToken: row.mesh_token || undefined,
    meshApiKey: row.mesh_api_key || undefined, // Persistent API key (preferred)
    modelProviderId: row.model_provider_id || undefined,
    modelId: row.model_id || undefined,
    agentId: row.agent_id || undefined,
    systemPrompt: row.system_prompt || undefined,
    botToken: row.bot_token,
    discordPublicKey: row.discord_public_key || undefined,
    authorizedGuilds: row.authorized_guilds || undefined,
    ownerId: row.owner_id || undefined,
    commandPrefix: row.command_prefix || "!",
    configuredAt: row.configured_at,
    updatedAt: row.updated_at,
  };

  // Update cache
  cache.set(connectionId, {
    config,
    timestamp: Date.now(),
  });

  return config;
}

/**
 * Save Discord configuration to Supabase and cache
 */
export async function setDiscordConfig(config: DiscordConfig): Promise<void> {
  await saveConnectionConfig(config);

  // Update cache
  cache.set(config.connectionId, {
    config,
    timestamp: Date.now(),
  });

  console.log(
    `[ConfigCache] Saved Discord config for connection: ${config.connectionId}`,
  );
}

/**
 * Delete Discord configuration from Supabase and cache
 */
export async function deleteDiscordConfig(connectionId: string): Promise<void> {
  await deleteConnectionConfig(connectionId);
  cache.delete(connectionId);

  console.log(
    `[ConfigCache] Deleted Discord config for connection: ${connectionId}`,
  );
}

/**
 * Clear all cached configurations (useful for testing or forcing refresh)
 */
export function clearConfigCache(): void {
  cache.clear();
  console.log("[ConfigCache] Cache cleared");
}

/**
 * Get cache statistics
 */
export function getCacheStats() {
  const now = Date.now();
  let valid = 0;
  let expired = 0;

  for (const [_, entry] of cache) {
    if (now - entry.timestamp < CACHE_TTL_MS) {
      valid++;
    } else {
      expired++;
    }
  }

  return {
    total: cache.size,
    valid,
    expired,
    ttl: CACHE_TTL_MS,
  };
}

/**
 * Check if a guild is authorized to use this bot
 */
export function isGuildAuthorized(
  config: DiscordConfig,
  guildId: string,
): boolean {
  // If no authorized guilds specified, allow all
  if (!config.authorizedGuilds || config.authorizedGuilds.length === 0) {
    return true;
  }

  return config.authorizedGuilds.includes(guildId);
}
