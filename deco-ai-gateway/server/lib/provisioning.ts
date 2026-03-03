import { getCachedApiKey, loadApiKey, saveApiKey } from "./config-cache.ts";
import {
  isSupabaseConfigured,
  findExistingOrgConnection,
  type BillingMode,
  type LimitPeriod,
} from "./supabase-client.ts";
import { decrypt } from "./encryption.ts";
import { logger } from "./logger.ts";
import {
  getGatewayDefaults,
  isEligibleForCredit,
  PROVISIONING_TIMEOUT_MS,
} from "./constants.ts";

/**
 * In-flight provisioning promises per connectionId.
 * Prevents multiple concurrent requests from creating duplicate OpenRouter keys
 * when they all hit Supabase miss at the same time.
 */
const provisioningLocks = new Map<string, Promise<string | null>>();

/**
 * Per-organization lock to prevent TOCTOU races when deduplicating keys.
 * Two connections for the same org hitting `findExistingOrgConnection` = null
 * simultaneously could both create keys without this.
 */
const orgProvisioningLocks = new Map<string, Promise<string | null>>();

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
  limitPeriod: LimitPeriod | null,
  initialLimit: number,
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

  logger.info("Creating OpenRouter key", {
    keyName,
    organizationId,
    initialLimit,
  });

  const response = await fetch(OPENROUTER_KEYS_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${managementKey}`,
    },
    body: JSON.stringify({
      name: keyName,
      limit: initialLimit,
      limit_reset: limitPeriod ?? undefined,
    }),
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
 * Org-scoped provisioning: either reuse an existing key or create a new one.
 * Protected by a per-org lock so two connections for the same org cannot
 * both see findExistingOrgConnection = null and create duplicate keys.
 */
async function provisionOrReuseKey(
  connectionId: string,
  organizationId: string,
  meshUrl: string,
  organizationName: string | undefined,
  billingMode: BillingMode,
  limitPeriod: LimitPeriod | null,
  userEmail: string | undefined,
): Promise<string | null> {
  const existingOrgLock = orgProvisioningLocks.get(organizationId);
  if (existingOrgLock) {
    logger.debug("Org provisioning in-flight, waiting", {
      connectionId,
      organizationId,
    });
    await existingOrgLock;
    const recheckDb = await loadApiKey(connectionId);
    if (recheckDb) return recheckDb;
    return provisionOrReuseKey(
      connectionId,
      organizationId,
      meshUrl,
      organizationName,
      billingMode,
      limitPeriod,
      userEmail,
    );
  }

  let resolve: (v: string | null) => void;
  const orgPromise = new Promise<string | null>((r) => {
    resolve = r;
  });
  orgProvisioningLocks.set(organizationId, orgPromise);

  try {
    const existingOrgRow = await findExistingOrgConnection(organizationId);
    if (
      existingOrgRow?.encrypted_api_key &&
      existingOrgRow.encryption_iv &&
      existingOrgRow.encryption_tag
    ) {
      logger.info("Org already has a key from another connection — reusing", {
        connectionId,
        organizationId,
        existingConnectionId: existingOrgRow.connection_id,
        keyHash: existingOrgRow.openrouter_key_hash,
      });

      const existingKey = decrypt({
        ciphertext: existingOrgRow.encrypted_api_key,
        iv: existingOrgRow.encryption_iv,
        tag: existingOrgRow.encryption_tag,
      });

      await saveApiKey({
        connectionId,
        organizationId,
        meshUrl,
        apiKey: existingKey,
        openrouterKeyName: existingOrgRow.openrouter_key_name ?? "",
        openrouterKeyHash: existingOrgRow.openrouter_key_hash ?? "",
        billingMode: existingOrgRow.billing_mode,
        limitPeriod: existingOrgRow.limit_period ?? null,
        usageMarkupPct: existingOrgRow.usage_markup_pct,
        maxLimitUsd: existingOrgRow.max_limit_usd,
      });

      resolve!(existingKey);
      return existingKey;
    }

    logger.info("Provisioning new OpenRouter API key", {
      connectionId,
      organizationId,
      organizationName,
      source: "openrouter",
    });

    // Compute eligibility once so both key creation and limit update use the same value.
    const defs = await getGatewayDefaults();
    let defaultLimit: number;
    if (billingMode === "prepaid") {
      const eligible = await isEligibleForCredit(meshUrl, userEmail);
      defaultLimit = eligible ? defs.defaultPrepaidLimitUsd : 0;
      logger.info("Prepaid credit eligibility check", {
        organizationId,
        meshUrl,
        hasEmail: userEmail != null,
        eligible,
        initialLimit: defaultLimit,
      });
    } else {
      defaultLimit = defs.defaultPostpaidLimitUsd;
    }

    const { key, hash, name } = await createOpenRouterKey(
      organizationId,
      organizationName,
      limitPeriod,
      defaultLimit,
    );

    logger.debug("Saving encrypted key to Supabase", { connectionId });
    await saveApiKey({
      connectionId,
      organizationId,
      meshUrl,
      apiKey: key,
      openrouterKeyName: name,
      openrouterKeyHash: hash,
      billingMode,
      limitPeriod,
    });

    logger.info("Key provisioned and persisted", {
      connectionId,
      organizationId,
      keyName: name,
      keyHash: hash,
    });

    resolve!(key);
    return key;
  } catch (error) {
    resolve!(null);
    throw error;
  } finally {
    orgProvisioningLocks.delete(organizationId);
  }
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
  limitPeriod: LimitPeriod | null = null,
  userEmail?: string,
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
      return await provisionOrReuseKey(
        connectionId,
        organizationId,
        meshUrl,
        organizationName,
        billingMode,
        limitPeriod,
        userEmail,
      );
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
