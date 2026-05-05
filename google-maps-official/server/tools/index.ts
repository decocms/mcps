import { wrapBackendSnapshot } from "@decocms/mcps-shared/google-mcp";
import { BACKEND_URL, TOOL_SNAPSHOT } from "../constants.ts";
import { getGoogleAccessToken } from "../lib/env.ts";
import type { Env } from "../../shared/deco.gen.ts";

export const tools = wrapBackendSnapshot(TOOL_SNAPSHOT.tools, {
  backendUrl: BACKEND_URL,
  getAccessToken: (env) => getGoogleAccessToken(env as Env),
});
