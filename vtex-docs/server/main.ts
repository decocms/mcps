/**
 * VTEX Docs MCP
 *
 * MCP for RAG-based VTEX documentation search.
 */
import { serve } from "@decocms/mcps-shared/serve";
import { withRuntime } from "@decocms/runtime";
import { tools } from "./tools/index.ts";
import { type Env, StateSchema } from "./types/env.ts";

export type { Env };
export { StateSchema };

const runtime = withRuntime<Env, typeof StateSchema>({
  configuration: {
    scopes: [],
    state: StateSchema,
  },
  tools,
});

serve(runtime.fetch);
