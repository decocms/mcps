import type { Env } from "server/main";

export const getOpenRouterApiKey = (env: Env) => {
  const authorization =
    env.MESH_REQUEST_CONTEXT.authorization ?? process.env.OPENROUTER_API_KEY;
  if (!authorization) {
    throw new Error("Authorization header is required");
  }
  return authorization;
};
