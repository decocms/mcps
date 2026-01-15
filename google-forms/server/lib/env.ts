import type { Env } from "../../shared/deco.gen.ts";

/**
 * Get Google OAuth access token (without Bearer prefix)
 */
export const getAccessToken = (env: Env): string => {
  const authorization = env.MESH_REQUEST_CONTEXT?.authorization;
  if (!authorization) {
    throw new Error(
      "Not authenticated. Please authorize with Google Forms first.",
    );
  }
  // Remove "Bearer " prefix if present to avoid double prefix in client
  return authorization.replace(/^Bearer\s+/i, "");
};
