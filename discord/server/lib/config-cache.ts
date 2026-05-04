/**
 * In-memory config cache (30s TTL) backed by Supabase.
 * Used by tools, gateway init, and webhook handlers to fetch the bot token
 * + connection metadata without round-tripping to Supabase on every call.
 */

import {
  loadConnectionConfig,
  saveConnectionConfig,
  deleteConnectionConfig,
} from "./supabase.ts";

export interface DiscordConfig {
  connectionId: string;
  organizationId: string;
  meshUrl: string;
  meshToken?: string;
  meshApiKey?: string;
  botToken: string;
  discordPublicKey?: string;
  discordApplicationId?: string;
  authorizedGuilds?: string[];
  state?: Record<string, unknown>;
  configuredAt?: string;
  updatedAt?: string;
}

interface CacheEntry {
  config: DiscordConfig;
  timestamp: number;
}

const cache = new Map<string, CacheEntry>();
const CACHE_TTL_MS = 30_000;

export async function getDiscordConfig(
  connectionId: string,
): Promise<DiscordConfig | null> {
  const cached = cache.get(connectionId);
  if (cached && Date.now() - cached.timestamp < CACHE_TTL_MS) {
    return cached.config;
  }

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
    meshApiKey: row.mesh_api_key || undefined,
    botToken: row.bot_token,
    discordPublicKey: row.discord_public_key || undefined,
    discordApplicationId: row.discord_application_id || undefined,
    authorizedGuilds: row.authorized_guilds || undefined,
    state: row.state ?? undefined,
    configuredAt: row.configured_at,
    updatedAt: row.updated_at,
  };

  cache.set(connectionId, { config, timestamp: Date.now() });
  return config;
}

export async function setDiscordConfig(config: DiscordConfig): Promise<void> {
  await saveConnectionConfig(config);
  cache.set(config.connectionId, { config, timestamp: Date.now() });
}

export async function deleteDiscordConfig(connectionId: string): Promise<void> {
  await deleteConnectionConfig(connectionId);
  cache.delete(connectionId);
}

export function isGuildAuthorized(
  config: DiscordConfig,
  guildId: string,
): boolean {
  if (!config.authorizedGuilds || config.authorizedGuilds.length === 0) {
    return true;
  }
  return config.authorizedGuilds.includes(guildId);
}
