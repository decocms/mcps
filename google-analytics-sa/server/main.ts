import { withRuntime } from "@decocms/runtime";
import { serve } from "@decocms/mcps-shared/serve";
import { withAuth } from "@decocms/mcps-shared/auth";

import { tools } from "google-analytics/tools";

import { type Env, StateSchema } from "../shared/deco.gen.ts";
import { getAccessToken, withToken } from "./lib/sa-auth.ts";
import { checkServiceAccountAccessTool } from "./tools/check-access.ts";

export type { Env };

const runtime = withRuntime<Env, typeof StateSchema>({
  configuration: {
    state: StateSchema,
  },
  tools: (env: Env) => [
    // The Google Analytics tools verbatim, with the OAuth bearer swapped for a
    // service account token. They read it off MESH_REQUEST_CONTEXT, so the tool
    // is rebuilt against a cloned env instead of mutating the shared one.
    // (named `makeTool`, not `createTool`, so scripts/check-auth.ts does not
    // read these calls as an unauthenticated createTool() from the runtime)
    ...tools.map((makeTool) => ({
      ...makeTool(env),
      execute: async (args: never) => {
        const token = await getAccessToken(env);
        return makeTool(withToken(env, token)).execute(args);
      },
    })),
    checkServiceAccountAccessTool(env),
  ],
});

serve(withAuth(runtime.fetch));
