import { getCachedApiKey, loadApiKey, saveApiKey } from "./config-cache.ts";
import { isSupabaseConfigured } from "./supabase-client.ts";

/**
 * In-flight provisioning promises per connectionId.
 * Prevents multiple concurrent requests from creating duplicate OpenRouter keys
 * when they all hit Supabase miss at the same time.
 */
const provisioningLocks = new Map<string, Promise<string | null>>();

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
  organizationName?: string,
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

  console.log(
    `[Gateway] 📡 POST ${OPENROUTER_KEYS_URL} — creating key "${keyName}"`,
  );

  const response = await fetch(OPENROUTER_KEYS_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${managementKey}`,
    },
    body: JSON.stringify({ name: keyName }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    console.error(
      `[Gateway] ❌ OpenRouter responded ${response.status}: ${errorText}`,
    );
    throw new Error(
      `OpenRouter key creation failed (${response.status}): ${errorText}`,
    );
  }

  const raw = await response.json();
  const result = raw as OpenRouterKeyResponse;

  // The key may be at top-level (result.key) or nested (result.data.key)
  const key = (raw as Record<string, string>).key ?? result.data?.key;

  const hash = result.data?.hash ?? (raw as Record<string, string>).hash;
  const name = result.data?.name ?? (raw as Record<string, string>).name;

  if (!key) {
    throw new Error(
      `OpenRouter response missing key field. Full response: ${JSON.stringify(raw)}`,
    );
  }

  console.log(
    `[Gateway] ✅ OpenRouter key created — name="${name}", hash="${hash}"`,
  );

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
): Promise<string | null> {
  console.log(
    `[Gateway] 🔍 ensureApiKey — connectionId=${connectionId}, orgId=${organizationId}`,
  );

  const cached = getCachedApiKey(connectionId);
  if (cached) {
    console.log(`[Gateway] ⚡ API key found in memory cache`);
    return cached;
  }

  console.log(`[Gateway] 🗄️  Cache miss — checking Supabase...`);
  const fromDb = await loadApiKey(connectionId);
  if (fromDb) {
    console.log(`[Gateway] ✅ API key loaded and decrypted from Supabase`);
    return fromDb;
  }

  console.log(`[Gateway] 🗄️  Supabase miss — key not provisioned yet`);

  if (!isSupabaseConfigured()) {
    console.error(
      "[Gateway] ❌ Supabase not configured (SUPABASE_URL / SUPABASE_ANON_KEY missing)",
    );
    return null;
  }

  // Lock: if a provisioning is already in-flight for this connection,
  // wait for it instead of creating a duplicate OpenRouter key.
  const existingLock = provisioningLocks.get(connectionId);
  if (existingLock) {
    console.log(
      `[Gateway] ⏳ Provisioning already in-flight for ${connectionId} — waiting...`,
    );
    return existingLock;
  }

  const provisioningPromise = (async (): Promise<string | null> => {
    try {
      console.log(
        `[Gateway] 🔑 Provisioning new OpenRouter API key for org "${organizationId}"...`,
      );
      const { key, hash, name } = await createOpenRouterKey(
        organizationId,
        organizationName,
      );

      console.log(`[Gateway] 💾 Saving encrypted key to Supabase...`);
      await saveApiKey({
        connectionId,
        organizationId,
        meshUrl,
        apiKey: key,
        openrouterKeyName: name,
        openrouterKeyHash: hash,
      });

      console.log(
        `[Gateway] 🎉 Key provisioned and persisted — name="${name}", hash="${hash}"`,
      );
      return key;
    } catch (error) {
      console.error(
        "[Gateway] ❌ Failed to provision OpenRouter API key:",
        error,
      );
      return null;
    } finally {
      provisioningLocks.delete(connectionId);
    }
  })();

  provisioningLocks.set(connectionId, provisioningPromise);
  return provisioningPromise;
}
