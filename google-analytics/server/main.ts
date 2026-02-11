/**
 * Google Analytics MCP Server
 *
 * This MCP provides tools for interacting with Google Analytics 4 (GA4),
 * including property management, data reporting, and realtime analytics.
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
    scopes: [GOOGLE_SCOPES.ANALYTICS_READONLY, GOOGLE_SCOPES.ANALYTICS],
  }),
});

serve(runtime.fetch);
