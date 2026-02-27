import { getCachedApiKey, loadApiKey, saveApiKey } from "./config-cache.ts";
import { isSupabaseConfigured, type BillingMode } from "./supabase-client.ts";
import { updateKeyLimit } from "./openrouter-keys.ts";
import { logger } from "./logger.ts";
import { DEFAULT_LIMIT_USD, PROVISIONING_TIMEOUT_MS } from "./constants.ts";

export { DEFAULT_LIMIT_USD };

/**
 * In-flight provisioning promises per connectionId.
 * Prevents multiple concurrent requests from creating duplicate OpenRouter keys
 * when they all hit Supabase miss at the same time.
 */
const provisioningLocks = new Map<string, Promise<string | null>>();

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return Promise.race([
    promise,
    new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error("Provisioning timed out")), ms),
    ),
  ]);
}

const OPENROUTER_KEYS_URL = "https://openrouter.ai/api/v1/keys";

interface OpenRouterKeyResponse {
  key?: string;
  data?: {
    key?: string;
    hash?: string;
    name?: string;
    label?: string | null;
    disabled?: boolean;
    limit?: number | null;
    limit_remaining?: number | null;
    usage?: number;
    is_provisioning_key?: boolean;
    created_at?: string;
    updated_at?: string;
  };
}

async function createOpenRouterKey(
  organizationId: string,
  organizationName: string | undefined,
  billingMode: BillingMode,
): Promise<{ key: string; hash: string; name: string }> {
  const managementKey = process.env.OPENROUTER_MANAGEMENT_KEY;
  if (!managementKey) {
    throw new Error(
      "OPENROUTER_MANAGEMENT_KEY env var is required to provision API keys",
    );
  }

  const slug = organizationName
    ? `${organizationName.toLowerCase().replace(/[^a-z0-9-]/g, "-")}-${organizationId.slice(0, 8)}`
    : organizationId;

  const keyName = `decocms-mesh-org-${slug}`;

  logger.info("Creating OpenRouter key", { keyName, organizationId });

  const response = await fetch(OPENROUTER_KEYS_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${managementKey}`,
    },
    body: JSON.stringify(
      billingMode === "prepaid"
        ? { name: keyName, limit: DEFAULT_LIMIT_USD, limit_reset: "monthly" }
        : { name: keyName },
    ),
  });

  if (!response.ok) {
    const errorText = await response.text();
    logger.error("OpenRouter key creation failed", {
      status: response.status,
      error: errorText,
      organizationId,
    });
    throw new Error(
      `OpenRouter key creation failed (${response.status}): ${errorText}`,
    );
  }

  const raw = await response.json();
  const result = raw as OpenRouterKeyResponse;

  const key = (raw as Record<string, string>).key ?? result.data?.key;
  const hash = result.data?.hash ?? (raw as Record<string, string>).hash;
  const name = result.data?.name ?? (raw as Record<string, string>).name;

  if (!key) {
    throw new Error(
      `OpenRouter response missing key field. Response keys: [${Object.keys(raw as Record<string, unknown>).join(", ")}]`,
    );
  }

  logger.info("OpenRouter key created", {
    keyName: name,
    keyHash: hash,
    limit: result.data?.limit,
    limitRemaining: result.data?.limit_remaining,
  });

  return { key, hash, name };
}

/**
 * Ensure an OpenRouter API key exists for this connection.
 * 1. Check in-memory cache (sync, fast)
 * 2. Check Supabase (decrypt on load)
 * 3. Create via OpenRouter Provisioning API (with per-connection lock to prevent races)
 *
 * Called on every tool invocation — cache makes subsequent calls instant.
 */
export async function ensureApiKey(
  connectionId: string,
  organizationId: string,
  meshUrl: string,
  organizationName?: string,
  billingMode: BillingMode = "prepaid",
): Promise<string | null> {
  logger.debug("ensureApiKey called", { connectionId, organizationId });

  const cached = getCachedApiKey(connectionId);
  if (cached) {
    logger.debug("API key resolved from memory cache", {
      connectionId,
      source: "cache",
    });
    return cached;
  }

  logger.debug("Cache miss, checking Supabase", {
    connectionId,
    source: "supabase",
  });

  const fromDb = await loadApiKey(connectionId);
  if (fromDb) {
    logger.info("API key loaded from Supabase", {
      connectionId,
      source: "supabase",
    });
    return fromDb;
  }

  if (!isSupabaseConfigured()) {
    logger.error("Supabase not configured — cannot provision key", {
      connectionId,
    });
    return null;
  }

  const existingLock = provisioningLocks.get(connectionId);
  if (existingLock) {
    logger.debug("Provisioning already in-flight, waiting", { connectionId });
    return existingLock;
  }

  const provisioningPromise = (async (): Promise<string | null> => {
    try {
      logger.info("Provisioning new OpenRouter API key", {
        connectionId,
        organizationId,
        organizationName,
        source: "openrouter",
      });

      const { key, hash, name } = await createOpenRouterKey(
        organizationId,
        organizationName,
        billingMode,
      );

      if (billingMode === "prepaid") {
        logger.info("Applying default spending limit to new key", {
          connectionId,
          keyHash: hash,
          limitUsd: DEFAULT_LIMIT_USD,
        });
        const limitResult = await updateKeyLimit(
          hash,
          DEFAULT_LIMIT_USD,
          "monthly",
          false,
        );
        logger.info("Default spending limit applied (prepaid)", {
          connectionId,
          limitUsd: DEFAULT_LIMIT_USD,
          resultLimit: limitResult.limit,
          resultRemaining: limitResult.limit_remaining,
        });
      } else {
        logger.info("Postpaid mode — no spending limit applied", {
          connectionId,
        });
      }

      logger.debug("Saving encrypted key to Supabase", { connectionId });
      await saveApiKey({
        connectionId,
        organizationId,
        meshUrl,
        apiKey: key,
        openrouterKeyName: name,
        openrouterKeyHash: hash,
        billingMode,
      });

      logger.info("Key provisioned and persisted", {
        connectionId,
        organizationId,
        keyName: name,
        keyHash: hash,
      });

      return key;
    } catch (error) {
      logger.error("Failed to provision OpenRouter API key", {
        connectionId,
        organizationId,
        error: String(error),
      });
      return null;
    } finally {
      provisioningLocks.delete(connectionId);
    }
  })();

  const bounded = withTimeout(provisioningPromise, PROVISIONING_TIMEOUT_MS);
  provisioningLocks.set(connectionId, bounded);
  return bounded;
}
