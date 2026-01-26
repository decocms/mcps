/**
 * Google Meet MCP Server
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
      GOOGLE_SCOPES.MEETINGS_SPACE_CREATED,
      GOOGLE_SCOPES.MEETINGS_SPACE_READONLY,
    ],
  }),
});

serve(runtime.fetch);
