import type { Env } from "../../shared/deco.gen.ts";

/**
 * Get Google OAuth access token from environment context
 * @param env - The environment containing the mesh request context
 * @returns The OAuth access token (without Bearer prefix)
 * @throws Error if not authenticated
 */
export const getGoogleAccessToken = (env: Env): string => {
  const authorization = env.MESH_REQUEST_CONTEXT?.authorization;
  if (!authorization) {
    throw new Error(
      "Not authenticated. Please authorize with Google Analytics first.",
    );
  }
  // Remove "Bearer " prefix if present to avoid double prefix in client
  return authorization.replace(/^Bearer\s+/i, "");
};
