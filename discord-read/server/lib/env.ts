import type { Env } from "../types/env.ts";

/**
 * Get Discord Bot Token from Supabase configuration
 *
 * IMPORTANT: This retrieves the DISCORD bot token, not the Mesh token!
 * The Discord bot token is stored in Supabase via DISCORD_SAVE_CONFIG.
 *
 * @param env - The environment containing the mesh request context
 * @returns The Discord Bot Token to use for authentication with Discord API
 * @throws Error if bot token is not configured
 */
export const getDiscordBotToken = async (env: Env): Promise<string> => {
  const connectionId =
    env.MESH_REQUEST_CONTEXT?.connectionId || "default-connection";

  // Load Discord config from Supabase (includes botToken)
  const { getDiscordConfig } = await import("./config-cache.ts");
  const config = await getDiscordConfig(connectionId);

  if (!config?.botToken) {
    throw new Error(
      `Discord Bot Token not configured for connection '${connectionId}'. ` +
        "Please use DISCORD_SAVE_CONFIG to save your bot token first.",
    );
  }

  return config.botToken;
};
