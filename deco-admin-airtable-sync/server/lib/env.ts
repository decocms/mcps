import type { Env } from "../types/env.ts";

function extractBearerToken(value: string): string {
  const trimmed = value.trim();
  const bearerMatch = /^Bearer\s+(.+)$/i.exec(trimmed);
  return (bearerMatch ? bearerMatch[1] : trimmed).trim();
}

export function getApiKey(env: Env): string {
  const authorization = env.MESH_REQUEST_CONTEXT?.authorization?.trim();

  if (!authorization) {
    throw new Error("Unauthorized: Missing authorization header");
  }

  const token = extractBearerToken(authorization);

  if (!token) {
    throw new Error("Unauthorized: Invalid authorization format");
  }

  return token;
}
