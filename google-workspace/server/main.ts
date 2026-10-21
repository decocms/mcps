import { withRuntime } from "@decocms/runtime";
import type { Registry } from "@decocms/mcps-shared/registry";
import { serve } from "@decocms/mcps-shared/serve";
import { createGoogleOAuth } from "@decocms/mcps-shared/google-oauth";

import { tools } from "./tools/index.ts";
import { prompts } from "./prompts.ts";
import { GOOGLE_WORKSPACE_SCOPES } from "./constants.ts";
import { type Env, StateSchema } from "../shared/deco.gen.ts";

export type { Env };

const runtime = withRuntime<Env, typeof StateSchema, Registry>({
  configuration: {
    scopes: [],
    state: StateSchema,
  },
  tools: (env: Env) => tools.map((createTool) => createTool(env)),
  prompts: () => prompts,
  // Google's Workspace MCPs only accept OAuth clients marked "agentic". These
  // optional vars let this MCP use its own agentic client instead of the
  // GOOGLE_CLIENT_ID shared with the REST-based Google MCPs. Switching clients
  // invalidates existing refresh tokens, so every user reconnects once.
  oauth: createGoogleOAuth({
    scopes: GOOGLE_WORKSPACE_SCOPES,
    clientId: process.env.GOOGLE_WORKSPACE_CLIENT_ID || undefined,
    clientSecret: process.env.GOOGLE_WORKSPACE_CLIENT_SECRET || undefined,
  }),
});

serve(runtime.fetch);
