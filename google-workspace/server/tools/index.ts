/**
 * Aggregates tool factories for every Google service we proxy. Each backend
 * MCP's tools/list snapshot lives in ./generated/<service>.json — re-run
 * `bun run generate-tools` to refresh.
 */

import { wrapBackendSnapshot } from "@decocms/mcps-shared/google-mcp";
import { BACKEND_MCPS, TOOL_SNAPSHOTS } from "../constants.ts";
import { getGoogleAccessToken } from "../lib/env.ts";
import type { Env } from "../../shared/deco.gen.ts";

export const tools = (
  Object.keys(TOOL_SNAPSHOTS) as Array<keyof typeof TOOL_SNAPSHOTS>
).flatMap((service) =>
  wrapBackendSnapshot(TOOL_SNAPSHOTS[service].tools, {
    backendUrl: BACKEND_MCPS[service],
    prefix: service,
    getAccessToken: (env) => getGoogleAccessToken(env as Env),
  }),
);
