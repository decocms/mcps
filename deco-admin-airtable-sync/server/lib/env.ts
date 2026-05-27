import type { Env } from "../types/env.ts";

export function getApiKey(env: Env): string {
  const authorization = env.MESH_REQUEST_CONTEXT?.authorization;

  if (!authorization) {
    throw new Error("Unauthorized: Missing authorization header");
  }

  const token = authorization.startsWith("Bearer ")
    ? authorization.slice(7)
    : authorization;

  if (!token) {
    throw new Error("Unauthorized: Invalid authorization format");
  }

  return token;
}
