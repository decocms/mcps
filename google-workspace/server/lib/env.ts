import type { Env } from "../../shared/deco.gen.ts";

/**
 * Extract the Google access token from the request context. The mesh
 * runtime injects it after running the OAuth flow declared in main.ts.
 */
export const getGoogleAccessToken = (env: Env): string => {
  const authorization = env.MESH_REQUEST_CONTEXT?.authorization;
  if (!authorization) {
    throw new Error(
      "Not authenticated. Please authorize Google Workspace first.",
    );
  }
  return authorization;
};
