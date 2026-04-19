/**
 * Google Analytics (GA4) MCP Server
 *
 * This MCP provides tools for interacting with Google Analytics 4,
 * including querying reports, fetching realtime data, and retrieving property details.
 */
import { withRuntime } from "@decocms/runtime";
import { serve } from "@decocms/mcps-shared/serve";
import { createGoogleOAuth } from "@decocms/mcps-shared/google-oauth";

import { tools } from "./tools/index.ts";
import type { Env } from "./types/env.ts";

export type { Env };

/**
 * Configure the MCP runtime
 *
 * This sets up:
 * - OAuth configuration for Google Analytics read-only access
 * - Tools (from ./tools/index.ts)
 */
const runtime = withRuntime<Env>({
  tools: (env: Env) => tools.map((createTool) => createTool(env)),
  oauth: createGoogleOAuth({
    scopes: ["https://www.googleapis.com/auth/analytics.readonly"],
  }),
});

// Start the server
if (runtime.fetch) {
  serve(runtime.fetch);
}
