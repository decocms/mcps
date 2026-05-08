import type { Env } from "../../shared/deco.gen.ts";

export function getApiKey(env: Env): string {
  const auth = env.MESH_REQUEST_CONTEXT?.authorization ?? "";
  return auth.startsWith("Bearer ") ? auth.slice(7) : auth;
}
