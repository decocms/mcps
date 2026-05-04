/**
 * Rate-limit-aware Discord REST client.
 *
 * Used by every management tool that hits Discord's HTTP API. Handles 429
 * with retry-after parsing, exponential backoff for 5xx, and X-Audit-Log-Reason.
 */

import type { Env } from "../types/env.ts";
import { getInstance } from "../bot/instance.ts";
import { getDiscordBotToken } from "../lib/env-resolver.ts";

const DISCORD_API_BASE = "https://discord.com/api/v10";
const MAX_RETRIES = 5;
const BASE_DELAY_MS = 100;
const MAX_DELAY_MS = 5000;

const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

export interface DiscordAPIOptions {
  method?: "GET" | "POST" | "PUT" | "PATCH" | "DELETE";
  body?: unknown;
  reason?: string;
}

interface RateLimitInfo {
  retryAfter: number;
  global: boolean;
  bucket?: string;
}

function parseRateLimitInfo(response: Response, body?: string): RateLimitInfo {
  let retryAfter = 1;
  let global = false;
  const retryHeader = response.headers.get("Retry-After");
  const globalHeader = response.headers.get("X-RateLimit-Global");
  const bucket = response.headers.get("X-RateLimit-Bucket") || undefined;

  if (retryHeader) retryAfter = parseFloat(retryHeader);
  if (globalHeader === "true") global = true;

  if (body) {
    try {
      const json = JSON.parse(body);
      if (json.retry_after !== undefined) retryAfter = json.retry_after;
      if (json.global !== undefined) global = json.global;
    } catch {
      // ignore
    }
  }

  return { retryAfter, global, bucket };
}

export async function discordAPI<T>(
  env: Env,
  endpoint: string,
  options: DiscordAPIOptions = {},
): Promise<T> {
  let botToken: string;
  try {
    botToken = await getDiscordBotToken(env);
  } catch (err) {
    const connectionId =
      env.MESH_REQUEST_CONTEXT?.connectionId || "default-connection";
    const instance = getInstance(connectionId);
    if (instance?.env) {
      botToken = await getDiscordBotToken(instance.env);
    } else {
      throw err;
    }
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

    if (response.status === 429) {
      const errorText = await response.text().catch(() => "");
      const info = parseRateLimitInfo(response, errorText);
      const waitMs = Math.min((info.retryAfter + 0.1) * 1000, MAX_DELAY_MS);
      await delay(waitMs);
      continue;
    }

    if (!response.ok) {
      const errorText = await response.text().catch(() => "");
      lastError = new Error(
        `Discord API ${response.status}: ${errorText || response.statusText}`,
      );
      if (response.status >= 400 && response.status < 500) throw lastError;

      const backoffMs = Math.min(
        BASE_DELAY_MS * Math.pow(2, attempt),
        MAX_DELAY_MS,
      );
      await delay(backoffMs);
      continue;
    }

    if (response.status === 204) return {} as T;
    return response.json() as Promise<T>;
  }

  throw lastError || new Error("Discord API: max retries exceeded");
}

export function encodeEmoji(emoji: string): string {
  if (emoji.includes(":")) return emoji;
  return encodeURIComponent(emoji);
}

/**
 * Run an operation across many items sequentially with rate-limit-aware delays.
 * Used by bulk-delete tools that hit Discord per-item.
 */
export async function discordAPIBatch<T, R>(
  _env: Env,
  items: T[],
  operation: (item: T) => Promise<R>,
  options: {
    delayMs?: number;
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
      if (onProgress) onProgress(i + 1, items.length, result);
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : String(err);
      errors.push({ item, error: errorMsg });
      if (onError) {
        const action = onError(item, err as Error);
        if (action === "stop") break;
      }
    }
    if (i < items.length - 1) await delay(delayMs);
  }

  return { results, errors };
}
