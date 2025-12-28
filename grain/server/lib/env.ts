/**
 * Environment helpers for Grain API
 */

import type { Env } from "../main.ts";

/**
 * Get the Grain API key from the environment
 */
export function getGrainApiKey(env: Env): string {
  // Try to get from environment variable
  const apiKey = env.GRAIN_API_KEY;
  if (!apiKey) {
    throw new Error(
      "Grain API key not found. Please set GRAIN_API_KEY environment variable.",
    );
  }

  return apiKey;
}

/**
 * Get the Grain API base URL from the environment
 */
export function getGrainApiUrl(env: Env): string | undefined {
  return env.GRAIN_API_URL;
}
