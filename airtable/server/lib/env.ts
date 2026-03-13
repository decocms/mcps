import type { Env } from "../main.ts";

export function getAccessToken(env: Env): string {
  const auth = env.MESH_REQUEST_CONTEXT?.authorization ?? "";
  return auth.startsWith("Bearer ") ? auth.slice(7) : auth;
}
