import type { Env } from "../types/env.ts";

/**
 * Get Strapi API endpoint from the environment
 */
export const getStrapiApiEndpoint = (env: Env): string => {
  const apiEndpoint = env.STRAPI_API_ENDPOINT as string | undefined;

  if (!apiEndpoint) {
    throw new Error(
      "Strapi API endpoint missing. Please configure STRAPI_API_ENDPOINT in Mesh.",
    );
  }

  // Remove trailing /api if present (we add it in the endpoint paths)
  let endpoint = apiEndpoint.trim();
  if (endpoint.endsWith("/api")) {
    endpoint = endpoint.slice(0, -4);
  }
  if (endpoint.endsWith("/")) {
    endpoint = endpoint.slice(0, -1);
  }

  return endpoint;
};

/**
 * Get Strapi API token from Authorization header
 * The token is used directly as the Strapi API token
 *
 * @param env - The environment containing the mesh request context
 * @returns The Strapi API token to use for requests
 * @throws Error with 401 status if not authenticated
 */
export const getStrapiApiToken = (env: Env): string => {
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

  // Use the token directly as the Strapi API token
  return token;
};
