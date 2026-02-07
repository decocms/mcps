import type { Env } from "server/main";

/**
 * Get Google Gemini API key from the authorization header.
 *
 * This MCP acts as a proxy -- users must pass their own Google AI API key
 * via the authorization header. The "Bearer " prefix is stripped since both
 * the Gemini REST API (query param) and @ai-sdk/google (x-goog-api-key
 * header) expect a raw API key.
 */
export const getGeminiApiKey = (env: Env) => {
  const authorization = env.MESH_REQUEST_CONTEXT.authorization;
  if (!authorization) {
    throw new Error("Authorization header is required");
  }
  // Strip "Bearer " prefix if present
  return authorization.replace(/^Bearer\s+/i, "");
};
