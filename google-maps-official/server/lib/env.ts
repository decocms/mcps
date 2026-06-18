import type { Env } from "../../shared/deco.gen.ts";

export const getGoogleAccessToken = (env: Env): string => {
  const authorization = env.MESH_REQUEST_CONTEXT?.authorization;
  if (!authorization) {
    throw new Error("Not authenticated. Please authorize Google Maps first.");
  }
  return authorization;
};
