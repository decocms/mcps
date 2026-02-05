/**
 * Google Apps Script MCP Server
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
      GOOGLE_SCOPES.SCRIPT_PROJECTS,
      GOOGLE_SCOPES.SCRIPT_PROJECTS_READONLY,
      GOOGLE_SCOPES.SCRIPT_DEPLOYMENTS,
      GOOGLE_SCOPES.SCRIPT_DEPLOYMENTS_READONLY,
      GOOGLE_SCOPES.SCRIPT_METRICS,
      GOOGLE_SCOPES.SCRIPT_PROCESSES,
    ],
  }),
});

serve(runtime.fetch);
