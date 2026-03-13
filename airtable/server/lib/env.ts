import type { Env } from "../main.ts";

export function getAccessToken(env: Env): string {
  const auth = env.MESH_REQUEST_CONTEXT?.authorization;
  if (!auth) {
    throw new Error("Missing authorization header. Please authenticate first.");
  }
  const match = auth.match(/^Bearer\s+(.+)$/i);
  if (!match || !match[1].trim()) {
    throw new Error("Invalid authorization header. Expected Bearer token.");
  }
  return match[1].trim();
}
