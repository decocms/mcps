import type { Env } from "../types/env.ts";

/**
 * Get Google OAuth access token from environment context
 * @param env - The environment containing the mesh request context
 * @returns The OAuth access token
 * @throws Error if not authenticated
 */
export const getGoogleAccessToken = (env: Env): string => {
  const authorization = env.MESH_REQUEST_CONTEXT?.authorization;
  const token = authorization?.replace(/^Bearer\s+/i, "").trim();
  if (!token) {
    throw new Error(
      "Not authenticated. Please authorize with Google Analytics first.",
    );
  }
  return token;
};
