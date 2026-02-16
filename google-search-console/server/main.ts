/**
 * Google Search Console MCP Server
 *
 * This MCP provides tools for interacting with Google Search Console API,
 * including search analytics, sitemap management, site management, and URL inspection.
 */
import { withRuntime } from "@decocms/runtime";
import { serve } from "@decocms/mcps-shared/serve";
import { createGoogleOAuth } from "@decocms/mcps-shared/google-oauth";

import { tools } from "./tools/index.ts";
import { GOOGLE_SCOPES } from "./constants.ts";
import type { Env } from "./types/env.ts";

// Export Env type for use in other files
export type { Env };

/**
 * Configure the MCP runtime
 *
 * This sets up:
 * - OAuth configuration for Google Search Console
 * - Tools (from ./tools/index.ts)
 */
const runtime = withRuntime<Env>({
  tools: (env: Env) => tools.map((createTool) => createTool(env)),
  oauth: createGoogleOAuth({
    scopes: [GOOGLE_SCOPES.WEBMASTERS],
  }),
});

serve(runtime.fetch);
