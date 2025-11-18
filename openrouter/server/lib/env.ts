import type { Env } from "../main.ts";
import { assertEnvKey } from "@decocms/mcps-shared/tools/utils/api-client";

export function getOpenRouterApiKey(env: Env): string {
  assertEnvKey(env, "OPENROUTER_API_KEY");
  return env.OPENROUTER_API_KEY as string;
}
