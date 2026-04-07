import type { Env } from "../types/env.ts";

/**
 * Get Discord Bot Token from Authorization header or Supabase configuration
 *
 * Priority:
 * 1. Authorization header (for direct API usage: "Authorization: YOUR_BOT_TOKEN")
 * 2. Supabase config (via DISCORD_SAVE_CONFIG) - for persistent bots
 *
 * @param env - The environment containing the mesh request context
 * @returns The Discord Bot Token to use for authentication with Discord API
 * @throws Error if bot token is not configured
 */
export const getDiscordBotToken = async (env: Env): Promise<string> => {
  const connectionId =
    env.MESH_REQUEST_CONTEXT?.connectionId || "default-connection";

  // 1️⃣ PRIORITY: Check Authorization header (direct API usage)
  // When app.json has auth:null, the token goes through unchanged
  const authHeader = env.MESH_REQUEST_CONTEXT?.authorization;
  if (authHeader) {
    // Remove "Bearer " prefix if present
    const token = authHeader.replace(/^Bearer\s+/i, "").trim();
    if (token && token.length > 20) {
      // Basic validation (Discord bot tokens are long)
      console.log(
        `[Token] Using Authorization header for ${connectionId} (token: ${token.slice(0, 10)}...${token.slice(-4)})`,
      );
      return token;
    }
  }

  // 2️⃣ FALLBACK: Load from Supabase configuration
  const { getDiscordConfig } = await import("./config-cache.ts");
  const config = await getDiscordConfig(connectionId);

  if (!config?.botToken) {
    throw new Error(
      `Discord Bot Token not configured.\n\n` +
        `Options:\n` +
        `1. Direct API: Pass token in Authorization header:\n` +
        `   "Authorization: YOUR_DISCORD_BOT_TOKEN" or\n` +
        `   "Authorization: Bearer YOUR_DISCORD_BOT_TOKEN"\n` +
        `2. Via Mesh: Use DISCORD_SAVE_CONFIG tool to save bot token for connection '${connectionId}'`,
    );
  }

  console.log(
    `[Token] Using Supabase config for ${connectionId} (token: ${config.botToken.slice(0, 10)}...${config.botToken.slice(-4)})`,
  );
  return config.botToken;
};
