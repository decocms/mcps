import { assertEnvKey } from "@decocms/mcps-shared/tools/utils/api-client";
import type { Env } from "../main.ts";

export function getOpenRouterApiKey(env: Env): string {
  if (
    // if contract was not signed, use the API key from the state
    !env.OPENROUTER_CONTRACT &&
    env.MESH_REQUEST_CONTEXT.state.OPENROUTER_API_KEY
  ) {
    return env.MESH_REQUEST_CONTEXT.state.OPENROUTER_API_KEY;
  }
  assertEnvKey(env, "OPENROUTER_API_KEY");
  return env.OPENROUTER_API_KEY as string;
}
