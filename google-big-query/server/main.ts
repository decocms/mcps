/**
 * Google BigQuery MCP Server
 *
 * This MCP provides tools for interacting with Google BigQuery API,
 * including querying datasets, listing tables, and exploring schemas.
 */
import { withRuntime } from "@decocms/runtime";
import { serve } from "@decocms/mcps-shared/serve";
import { createGoogleOAuth } from "@decocms/mcps-shared-v2/google-oauth";

import { tools } from "./tools/index.ts";
import { GOOGLE_SCOPES } from "./constants.ts";
import type { Env } from "../shared/deco.gen.ts";

export type { Env };

const runtime = withRuntime<Env>({
  tools: (env: Env) => tools.map((createTool) => createTool(env)),
  oauth: createGoogleOAuth({
    scopes: [
      GOOGLE_SCOPES.BIGQUERY,
      GOOGLE_SCOPES.BIGQUERY_READONLY,
      GOOGLE_SCOPES.CLOUD_PLATFORM_READ_ONLY,
    ],
  }),
});

serve(runtime.fetch);
