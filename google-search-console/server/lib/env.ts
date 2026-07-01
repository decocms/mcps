import type { Env } from "../../shared/deco.gen.ts";

/**
 * Get Google OAuth access token from environment context
 * @param env - The environment containing the mesh request context
 * @returns The OAuth access token
 * @throws Error if not authenticated
 */
export const getGoogleAccessToken = (env: Env): string => {
  const authorization = env.MESH_REQUEST_CONTEXT?.authorization;
  if (!authorization) {
    throw new Error(
      "Not authenticated. Please authorize with Google Search Console first.",
    );
  }
  return authorization.replace(/^Bearer\s+/i, "");
};

/**
 * Resolves the site URL to use for a request.
 *
 * Prefers the `siteUrl` passed to the tool; when omitted, falls back to the
 * default `siteUrl` configured on the MCP installation state.
 *
 * @param env - The environment containing the mesh request context
 * @param siteUrl - The site URL passed to the tool, if any
 * @returns The resolved site URL
 * @throws Error if neither a passed nor a configured site URL is available
 */
export const resolveSiteUrl = (env: Env, siteUrl?: string | null): string => {
  const resolved = siteUrl ?? env.MESH_REQUEST_CONTEXT?.state?.siteUrl;
  if (!resolved) {
    throw new Error(
      "No site URL provided. Pass a `siteUrl` argument or configure a default `siteUrl` in this integration's settings.",
    );
  }
  return resolved;
};
