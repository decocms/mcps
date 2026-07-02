/**
 * Google Tag Manager MCP Server
 *
 * This MCP provides tools for interacting with Google Tag Manager API v2,
 * including account, container, workspace, tag, trigger, and variable management.
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
    // edit.containers covers container/workspace/tag/trigger/variable
    // CRUD; readonly covers the account read tools. Container deletion
    // would require tagmanager.delete.containers and is not exposed.
    scopes: [GOOGLE_SCOPES.TAGMANAGER_EDIT, GOOGLE_SCOPES.TAGMANAGER_READONLY],
  }),
});

serve(runtime.fetch);
