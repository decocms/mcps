import { logger } from "./logger.ts";

const OPENROUTER_KEYS_URL = "https://openrouter.ai/api/v1/keys";
const HASH_PATTERN = /^[a-zA-Z0-9_-]+$/;

function validateHash(hash: string): void {
  if (!HASH_PATTERN.test(hash)) {
    throw new Error("Invalid OpenRouter key hash format");
  }
}

export type LimitReset = "daily" | "weekly" | "monthly";

/**
 * Full response schema from GET /api/v1/keys/:hash
 * @see https://openrouter.ai/docs/api/api-reference/api-keys/get-key
 */
export interface OpenRouterKeyDetails {
  hash: string;
  name: string;
  label: string | null;
  disabled: boolean;
  limit: number | null;
  limit_remaining: number | null;
  limit_reset: string | null;
  include_byok_in_limit: boolean;
  usage: number;
  usage_daily: number;
  usage_weekly: number;
  usage_monthly: number;
  byok_usage: number;
  byok_usage_daily: number;
  byok_usage_weekly: number;
  byok_usage_monthly: number;
  created_at: string;
  updated_at: string | null;
  expires_at: string | null;
}

export interface UpdateKeyResult {
  hash: string;
  name: string;
  disabled: boolean;
  limit: number | null;
  limit_remaining: number | null;
  limit_reset: string | null;
  include_byok_in_limit: boolean;
  usage: number;
  usage_daily: number;
  usage_weekly: number;
  usage_monthly: number;
}

function getManagementKey(): string {
  const key = process.env.OPENROUTER_MANAGEMENT_KEY;
  if (!key) {
    throw new Error("OPENROUTER_MANAGEMENT_KEY env var is required");
  }
  return key;
}

export async function getKeyDetails(
  hash: string,
): Promise<OpenRouterKeyDetails> {
  validateHash(hash);
  const response = await fetch(`${OPENROUTER_KEYS_URL}/${hash}`, {
    headers: { Authorization: `Bearer ${getManagementKey()}` },
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`OpenRouter responded ${response.status}: ${errorText}`);
  }

  const result = (await response.json()) as { data: OpenRouterKeyDetails };
  return result.data;
}

export async function updateKeyLimit(
  hash: string,
  limit: number | null,
  limitReset: LimitReset | null,
  includeByokInLimit: boolean,
): Promise<UpdateKeyResult> {
  validateHash(hash);
  const body: Record<string, unknown> = {
    limit,
    limit_reset: limitReset,
    include_byok_in_limit: includeByokInLimit,
  };

  logger.info("Updating OpenRouter key limit", {
    keyHash: hash,
    limit: limit ?? "none",
    limitReset: limitReset ?? "none",
    includeByokInLimit,
  });

  const response = await fetch(`${OPENROUTER_KEYS_URL}/${hash}`, {
    method: "PATCH",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${getManagementKey()}`,
    },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`OpenRouter responded ${response.status}: ${errorText}`);
  }

  const result = (await response.json()) as { data: UpdateKeyResult };
  return result.data;
}
