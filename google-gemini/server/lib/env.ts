import type { Env } from "server/main";

export const getGeminiApiKey = (env: Env) => {
  const authorization =
    env.MESH_REQUEST_CONTEXT.authorization ?? process.env.GOOGLE_GEMINI_API_KEY;
  if (!authorization) {
    throw new Error("Authorization header is required");
  }
  return authorization;
};
