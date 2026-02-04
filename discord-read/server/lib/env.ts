import type { Env } from "../types/env.ts";

/**
 * Get Discord Bot Token from custom header or Supabase configuration
 *
 * Priority:
 * 1. X-Discord-Bot-Token header (for direct API usage without Mesh auth)
 * 2. Supabase config (via DISCORD_SAVE_CONFIG) - for persistent bots
 *
 * @param env - The environment containing the mesh request context
 * @returns The Discord Bot Token to use for authentication with Discord API
 * @throws Error if bot token is not configured
 */
export const getDiscordBotToken = async (env: Env): Promise<string> => {
  // 1️⃣ PRIORITY: Check for X-Discord-Bot-Token custom header
  // This allows direct API usage: curl -H "X-Discord-Bot-Token: YOUR_BOT_TOKEN"
  const customToken = (env as any).X_DISCORD_BOT_TOKEN;
  if (customToken) {
    console.log(
      "[Auth] Using Discord Bot Token from X-Discord-Bot-Token header",
    );
    return customToken;
  }

  // 2️⃣ FALLBACK: Load from Supabase configuration
  const connectionId =
    env.MESH_REQUEST_CONTEXT?.connectionId || "default-connection";

  const { getDiscordConfig } = await import("./config-cache.ts");
  const config = await getDiscordConfig(connectionId);

  if (!config?.botToken) {
    throw new Error(
      `Discord Bot Token not configured.\n\n` +
        `Options:\n` +
        `1. Direct API: Pass token in custom header:\n` +
        `   "X-Discord-Bot-Token: YOUR_DISCORD_BOT_TOKEN"\n` +
        `2. Via Mesh: Use DISCORD_SAVE_CONFIG tool to save bot token for connection '${connectionId}'`,
    );
  }

  console.log("[Auth] Using Discord Bot Token from Supabase config");
  return config.botToken;
};
