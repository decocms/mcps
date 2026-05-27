import type { Env } from "../types/env.ts";

export function getApiKey(env: Env): string {
  const authorization = env.MESH_REQUEST_CONTEXT?.authorization?.trim();

  if (!authorization) {
    throw new Error("Unauthorized: Missing authorization header");
  }

  const bearerMatch = /^Bearer\s+(.+)$/i.exec(authorization);
  const token = (bearerMatch ? bearerMatch[1] : authorization).trim();

  if (!token) {
    throw new Error("Unauthorized: Invalid authorization format");
  }

  return token;
}
