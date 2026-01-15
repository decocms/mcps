import type { Env } from "../../shared/deco.gen.ts";

/**
 * Get TikTok access token from environment context
 * Supports both OAuth flow (via MESH_REQUEST_CONTEXT) and direct token (via env var)
 * @param env - The environment containing the mesh request context
 * @returns The access token
 * @throws Error if not authenticated
 */
export const getTikTokAccessToken = (env: Env): string => {
  // First try OAuth token from mesh context
  const authorization = env.MESH_REQUEST_CONTEXT?.authorization;
  if (authorization) {
    return authorization;
  }

  // Fall back to direct token from environment variable
  const directToken = process.env.TIKTOK_ACCESS_TOKEN;
  if (directToken) {
    return directToken;
  }

  throw new Error(
    "Not authenticated. Please provide TIKTOK_ACCESS_TOKEN or authorize with TikTok first.",
  );
};
