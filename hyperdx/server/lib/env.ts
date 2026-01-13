import type { Env } from "server/main";

/**
 * Get HyperDX API key from environment.
 *
 * Supports two modes:
 * 1. Stdio mode: reads from process.env.HYPERDX_API_KEY
 * 2. HTTP mode: reads from MESH_REQUEST_CONTEXT.authorization (Bearer token)
 *
 * In Mesh UI, set environment variable: HYPERDX_API_KEY=your_api_key
 */
export const getHyperDXApiKey = (env?: Env) => {
  // Priority 1: Environment variable (stdio mode)
  const envApiKey = process.env.HYPERDX_API_KEY;
  if (envApiKey) {
    console.log("[HyperDX] Using API key from HYPERDX_API_KEY env var");
    return envApiKey;
  }

  // Priority 2: Bearer token from Mesh request context (HTTP mode)
  const authorization = env?.MESH_REQUEST_CONTEXT?.authorization;
  console.log("[HyperDX] Authorization:", authorization);
  if (authorization) {
    console.log("[HyperDX] Using API key from authorization header");
    // Strip "Bearer " prefix if present
    return authorization.startsWith("Bearer ")
      ? authorization.slice(7)
      : authorization;
  }

  throw new Error(
    "HyperDX API key not provided. Set HYPERDX_API_KEY environment variable or configure Bearer token in connection settings.",
  );
};
