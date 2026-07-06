import type { Env } from "../types/env.ts";

/** Get the Google OAuth access token (without Bearer prefix). */
export const getAccessToken = (env: Env): string => {
  const authorization = env.MESH_REQUEST_CONTEXT?.authorization;
  if (!authorization) {
    throw new Error(
      "Not authenticated. Please authorize with your Google/YouTube account first.",
    );
  }
  return authorization.replace(/^Bearer\s+/i, "");
};
