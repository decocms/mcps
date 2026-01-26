/**
 * Google Tag Manager MCP Server
 *
 * This MCP provides tools for interacting with Google Tag Manager API v2,
 * including account, container, workspace, tag, trigger, and variable management.
 */
import { withRuntime } from "@decocms/runtime";
import { serve } from "@decocms/mcps-shared/serve";
import {
  createGoogleOAuth,
  GOOGLE_SCOPES,
} from "@decocms/mcps-shared/google-oauth";

import { tools } from "./tools/index.ts";
import type { Env } from "../shared/deco.gen.ts";

export type { Env };

const runtime = withRuntime<Env>({
  tools: (env: Env) => tools.map((createTool) => createTool(env)),
  oauth: createGoogleOAuth({
    scopes: [
      GOOGLE_SCOPES.TAGMANAGER_EDIT,
      GOOGLE_SCOPES.TAGMANAGER_READONLY,
      GOOGLE_SCOPES.TAGMANAGER_MANAGE,
    ],
  }),
});

serve(runtime.fetch);
