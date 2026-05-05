import { withRuntime } from "@decocms/runtime";
import type { Registry } from "@decocms/mcps-shared/registry";
import { serve } from "@decocms/mcps-shared/serve";
import { createGoogleOAuth } from "@decocms/mcps-shared/google-oauth";

import { tools } from "./tools/index.ts";
import { GOOGLE_WORKSPACE_SCOPES } from "./constants.ts";
import { type Env, StateSchema } from "../shared/deco.gen.ts";

export type { Env };

const runtime = withRuntime<Env, typeof StateSchema, Registry>({
  configuration: {
    scopes: [],
    state: StateSchema,
  },
  tools: (env: Env) => tools.map((createTool) => createTool(env)),
  oauth: createGoogleOAuth({ scopes: GOOGLE_WORKSPACE_SCOPES }),
});

serve(runtime.fetch);
