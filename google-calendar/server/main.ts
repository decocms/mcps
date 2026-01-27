/**
 * Google Calendar MCP Server
 *
 * This MCP provides tools for interacting with Google Calendar API,
 * including calendar management, event CRUD operations, and availability checks.
 */
import { withRuntime } from "@decocms/runtime";
import { serve } from "@decocms/mcps-shared/serve";
import { createGoogleOAuth } from "@decocms/mcps-shared/google-oauth";

import { tools } from "./tools/index.ts";
import { GOOGLE_SCOPES } from "./constants.ts";
import type { Env } from "../shared/deco.gen.ts";

export type { Env };

const runtime = withRuntime<Env>({
  tools: (env: Env) => tools.map((createTool) => createTool(env)),
  oauth: createGoogleOAuth({
    scopes: [GOOGLE_SCOPES.CALENDAR, GOOGLE_SCOPES.CALENDAR_EVENTS],
  }),
});

serve(runtime.fetch);
