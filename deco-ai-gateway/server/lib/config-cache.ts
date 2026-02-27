import { encrypt, decrypt } from "./encryption.ts";
import {
  loadConnectionConfig,
  saveConnectionConfig,
  isSupabaseConfigured,
  type LlmGatewayConnectionRow,
  type BillingMode,
} from "./supabase-client.ts";
import { logger } from "./logger.ts";
import { DEFAULT_MARKUP_PCT } from "./constants.ts";

export interface GatewayConfig {
  connectionId: string;
  organizationId: string;
  meshUrl: string;
  openrouterKeyName: string | null;
  openrouterKeyHash: string | null;
}

/**
 * Sync in-memory cache of decrypted API keys per connectionId.
 * Populated during onChange, read synchronously during tools(env).
 */
const apiKeyCache = new Map<string, string>();

export function getCachedApiKey(connectionId: string): string | null {
  return apiKeyCache.get(connectionId) ?? null;
}

export function setCachedApiKey(connectionId: string, key: string): void {
  apiKeyCache.set(connectionId, key);
}

export function clearCachedApiKey(connectionId: string): void {
  apiKeyCache.delete(connectionId);
}

/**
 * Load the API key for a connection. Checks in-memory first,
 * then falls back to Supabase (decrypt on load).
 */
export async function loadApiKey(connectionId: string): Promise<string | null> {
  const cached = apiKeyCache.get(connectionId);
  if (cached) return cached;

  if (!isSupabaseConfigured()) return null;

  try {
    const row = await loadConnectionConfig(connectionId);
    if (!row?.encrypted_api_key || !row.encryption_iv || !row.encryption_tag) {
      return null;
    }

    const apiKey = decrypt({
      ciphertext: row.encrypted_api_key,
      iv: row.encryption_iv,
      tag: row.encryption_tag,
    });

    apiKeyCache.set(connectionId, apiKey);
    return apiKey;
  } catch (error) {
    logger.error("Failed to load API key from Supabase", {
      connectionId,
      error: String(error),
    });
    return null;
  }
}

/**
 * Encrypt and persist an API key for a connection.
 * Also updates the in-memory cache with the plaintext key.
 */
export async function saveApiKey(params: {
  connectionId: string;
  organizationId: string;
  meshUrl: string;
  apiKey: string;
  openrouterKeyName: string;
  openrouterKeyHash: string;
  billingMode?: BillingMode;
  usageMarkupPct?: number;
  maxLimitUsd?: number | null;
}): Promise<void> {
  const { ciphertext, iv, tag } = encrypt(params.apiKey);
  const now = new Date().toISOString();

  const row: LlmGatewayConnectionRow = {
    connection_id: params.connectionId,
    organization_id: params.organizationId,
    mesh_url: params.meshUrl,
    openrouter_key_name: params.openrouterKeyName,
    openrouter_key_hash: params.openrouterKeyHash,
    encrypted_api_key: ciphertext,
    encryption_iv: iv,
    encryption_tag: tag,
    billing_mode: params.billingMode ?? "prepaid",
    usage_markup_pct: params.usageMarkupPct ?? DEFAULT_MARKUP_PCT,
    max_limit_usd: params.maxLimitUsd ?? null,
    configured_at: now,
    updated_at: now,
  };

  await saveConnectionConfig(row);
  apiKeyCache.set(params.connectionId, params.apiKey);

  logger.info("API key saved and cached", {
    connectionId: params.connectionId,
    organizationId: params.organizationId,
  });
}
