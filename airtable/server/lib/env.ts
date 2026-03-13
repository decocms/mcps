import type { Env } from "../main.ts";

export function getAccessToken(env: Env): string {
  const auth = env.MESH_REQUEST_CONTEXT?.authorization;
  if (!auth) {
    throw new Error("Missing authorization header. Please authenticate first.");
  }
  if (!auth.startsWith("Bearer ")) {
    throw new Error("Invalid authorization header. Expected Bearer token.");
  }
  return auth.slice(7);
}
