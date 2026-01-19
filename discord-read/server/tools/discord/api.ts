/**
 * Discord API Client
 *
 * Shared utilities for making Discord API requests with rate limiting.
 */

import type { Env } from "../../types/env.ts";
import { getCurrentEnv } from "../../bot-manager.ts";

const DISCORD_API_BASE = "https://discord.com/api/v10";

// Rate limit configuration
const MAX_RETRIES = 5;
const BASE_DELAY_MS = 100; // Base delay between requests
const MAX_DELAY_MS = 5000; // Max delay for exponential backoff

// Simple delay helper
const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

export interface DiscordAPIOptions {
  method?: "GET" | "POST" | "PUT" | "PATCH" | "DELETE";
  body?: unknown;
  reason?: string; // X-Audit-Log-Reason header
  skipRateLimit?: boolean; // Skip rate limit handling (for internal use)
}

export interface RateLimitInfo {
  retryAfter: number;
  global: boolean;
  bucket?: string;
}

/**
 * Parse rate limit info from response
 */
function parseRateLimitInfo(response: Response, body?: string): RateLimitInfo {
  let retryAfter = 1; // Default 1 second
  let global = false;

  // Try to get from headers first
  const retryHeader = response.headers.get("Retry-After");
  const globalHeader = response.headers.get("X-RateLimit-Global");
  const bucket = response.headers.get("X-RateLimit-Bucket") || undefined;

  if (retryHeader) {
    retryAfter = parseFloat(retryHeader);
  }

  if (globalHeader === "true") {
    global = true;
  }

  // Try to parse from body
  if (body) {
    try {
      const json = JSON.parse(body);
      if (json.retry_after !== undefined) {
        retryAfter = json.retry_after;
      }
      if (json.global !== undefined) {
        global = json.global;
      }
    } catch {
      // Ignore parse errors
    }
  }

  return { retryAfter, global, bucket };
}

/**
 * Make a request to the Discord API with automatic rate limit handling.
 */
export async function discordAPI<T>(
  env: Env,
  endpoint: string,
  options: DiscordAPIOptions = {},
): Promise<T> {
  // Try to get token from passed env first, then fall back to global env
  let botToken: string | undefined = env.MESH_REQUEST_CONTEXT?.state?.BOT_TOKEN;

  if (!botToken) {
    // Fallback: try to get from global env (set when Discord bot started)
    const globalEnv = getCurrentEnv();
    botToken = globalEnv?.MESH_REQUEST_CONTEXT?.state?.BOT_TOKEN;
  }

  if (!botToken) {
    throw new Error(
      "BOT_TOKEN not configured. Make sure the Discord bot is initialized.",
    );
  }

  const headers: Record<string, string> = {
    Authorization: `Bot ${botToken}`,
    "Content-Type": "application/json",
  };

  if (options.reason) {
    headers["X-Audit-Log-Reason"] = encodeURIComponent(options.reason);
  }

  let lastError: Error | null = null;

  for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
    const response = await fetch(`${DISCORD_API_BASE}${endpoint}`, {
      method: options.method || "GET",
      headers,
      body: options.body ? JSON.stringify(options.body) : undefined,
    });

    // Handle rate limiting (429)
    if (response.status === 429) {
      const errorText = await response.text().catch(() => "");
      const rateLimitInfo = parseRateLimitInfo(response, errorText);

      // Calculate wait time (add small buffer)
      const waitMs = Math.min(
        (rateLimitInfo.retryAfter + 0.1) * 1000,
        MAX_DELAY_MS,
      );

      console.log(
        `⏳ [Discord API] Rate limited (${rateLimitInfo.global ? "global" : "bucket"}). ` +
          `Waiting ${waitMs.toFixed(0)}ms... (attempt ${attempt + 1}/${MAX_RETRIES})`,
      );

      await delay(waitMs);
      continue;
    }

    // Handle other errors
    if (!response.ok) {
      const errorText = await response.text().catch(() => "");
      lastError = new Error(
        `Discord API error (${response.status}): ${errorText || response.statusText}`,
      );

      // Don't retry on client errors (except 429 which is handled above)
      if (response.status >= 400 && response.status < 500) {
        throw lastError;
      }

      // Exponential backoff for server errors
      const backoffMs = Math.min(
        BASE_DELAY_MS * Math.pow(2, attempt),
        MAX_DELAY_MS,
      );
      console.log(
        `⚠️ [Discord API] Server error ${response.status}. Retrying in ${backoffMs}ms...`,
      );
      await delay(backoffMs);
      continue;
    }

    // Handle 204 No Content
    if (response.status === 204) {
      return {} as T;
    }

    return response.json() as Promise<T>;
  }

  throw lastError || new Error("Max retries exceeded for Discord API request");
}

/**
 * Execute multiple Discord API calls with rate limit awareness.
 * Processes items sequentially with delays to avoid rate limits.
 */
export async function discordAPIBatch<T, R>(
  env: Env,
  items: T[],
  operation: (item: T) => Promise<R>,
  options: {
    delayMs?: number; // Delay between operations (default: 100ms)
    onProgress?: (completed: number, total: number, result: R) => void;
    onError?: (item: T, error: Error) => "skip" | "stop";
  } = {},
): Promise<{ results: R[]; errors: Array<{ item: T; error: string }> }> {
  const { delayMs = BASE_DELAY_MS, onProgress, onError } = options;
  const results: R[] = [];
  const errors: Array<{ item: T; error: string }> = [];

  for (let i = 0; i < items.length; i++) {
    const item = items[i];

    try {
      const result = await operation(item);
      results.push(result);

      if (onProgress) {
        onProgress(i + 1, items.length, result);
      }
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      errors.push({ item, error: errorMsg });

      if (onError) {
        const action = onError(item, error as Error);
        if (action === "stop") {
          break;
        }
      }
    }

    // Add delay between operations (except for last item)
    if (i < items.length - 1) {
      await delay(delayMs);
    }
  }

  return { results, errors };
}

/**
 * Encode emoji for URL (handle custom emojis)
 */
export function encodeEmoji(emoji: string): string {
  // Custom emoji format: name:id
  if (emoji.includes(":")) {
    return emoji;
  }
  // Unicode emoji - URL encode
  return encodeURIComponent(emoji);
}
