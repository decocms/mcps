import type { Env } from "server/main";

/**
 * Get Google Gemini API key from the authorization header or environment.
 *
 * MESH_REQUEST_CONTEXT.authorization may include the "Bearer " prefix,
 * which must be stripped since both the Gemini REST API (query param)
 * and @ai-sdk/google (x-goog-api-key header) expect a raw API key.
 */
export const getGeminiApiKey = (env: Env) => {
  const authorization =
    env.MESH_REQUEST_CONTEXT.authorization ?? process.env.GOOGLE_GEMINI_API_KEY;
  if (!authorization) {
    throw new Error("Authorization header is required");
  }
  // Strip "Bearer " prefix if present
  return authorization.replace(/^Bearer\s+/i, "");
};
