/**
 * Discord API Client
 *
 * Shared utilities for making Discord API requests.
 */

import type { Env } from "../../types/env.ts";
import { getCurrentEnv } from "../../bot-manager.ts";

const DISCORD_API_BASE = "https://discord.com/api/v10";

export interface DiscordAPIOptions {
  method?: "GET" | "POST" | "PUT" | "PATCH" | "DELETE";
  body?: unknown;
  reason?: string; // X-Audit-Log-Reason header
}

/**
 * Make a request to the Discord API.
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

  const response = await fetch(`${DISCORD_API_BASE}${endpoint}`, {
    method: options.method || "GET",
    headers,
    body: options.body ? JSON.stringify(options.body) : undefined,
  });

  if (!response.ok) {
    const errorText = await response.text().catch(() => "");
    throw new Error(
      `Discord API error (${response.status}): ${errorText || response.statusText}`,
    );
  }

  // Handle 204 No Content
  if (response.status === 204) {
    return {} as T;
  }

  return response.json() as Promise<T>;
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
