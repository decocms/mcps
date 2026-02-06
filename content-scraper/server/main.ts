/**
 * Content Scraper MCP
 *
 * Simple MCP that scrapes web content via n8n webhook.
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
  tools: (env: Env) => tools.map((createTool) => createTool(env)),
});

serve(runtime.fetch);
