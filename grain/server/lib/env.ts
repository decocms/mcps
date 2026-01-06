import type { Env } from "../types/env.ts";

export const getGrainApiKey = (env: Env) => {
  const authorization = env.MESH_REQUEST_CONTEXT.authorization;
  if (!authorization) {
    throw new Error(
      "Authorization header is required. " +
        "Please configure your Grain API key. " +
        "You can get an API key from https://grain.com/settings/api",
    );
  }
  return authorization;
};
