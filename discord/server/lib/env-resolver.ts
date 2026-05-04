/**
 * Resolve the Discord bot token for a given env.
 *
 * Priority:
 *   1. Authorization header (Bearer <token> or raw token)
 *   2. Supabase config-cache via connectionId
 */

import type { Env } from "../types/env.ts";

export const getDiscordBotToken = async (env: Env): Promise<string> => {
  const connectionId =
    env.MESH_REQUEST_CONTEXT?.connectionId || "default-connection";

  const authHeader = env.MESH_REQUEST_CONTEXT?.authorization;
  if (authHeader) {
    const token = authHeader.replace(/^Bearer\s+/i, "").trim();
    if (token && token.length > 20) return token;
  }

  const { getDiscordConfig } = await import("./config-cache.ts");
  const config = await getDiscordConfig(connectionId);

  if (!config?.botToken) {
    throw new Error(
      `Discord bot token not configured for ${connectionId}. ` +
        `Use DISCORD_SAVE_CONFIG to save a token, or pass it via Authorization header.`,
    );
  }

  return config.botToken;
};
