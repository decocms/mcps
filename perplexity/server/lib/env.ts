import type { Env } from "../../shared/deco.gen.ts";

/**
 * Get Perplexity API key from Authorization header
 * The token is used directly as the Perplexity API key
 *
 * @param env - The environment containing the mesh request context
 * @returns The Perplexity API key to use for requests
 * @throws Error with 401 status if not authenticated
 */
export const getPerplexityApiKey = (env: Env): string => {
  const authorization = env.MESH_REQUEST_CONTEXT?.authorization;

  if (!authorization) {
    throw new Error("Unauthorized: Missing authorization header");
  }

  // Extract token from "Bearer <token>" format
  const token = authorization.startsWith("Bearer ")
    ? authorization.slice(7)
    : authorization;

  if (!token) {
    throw new Error("Unauthorized: Invalid authorization format");
  }

  // Use the token directly as the Perplexity API key
  return token;
};
