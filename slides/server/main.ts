/**
 * Slides MCP - AI-Powered Presentation Builder
 */
import { serve } from "@decocms/mcps-shared/serve";
import { withRuntime } from "@decocms/runtime";
import { tools } from "./tools/index.ts";
import { prompts } from "./prompts.ts";
import { resources } from "./resources/index.ts";
import { StateSchema, type Env, type Registry } from "./types/env.ts";

export { StateSchema };

const runtime = withRuntime<Env, typeof StateSchema, Registry>({
  configuration: {
    scopes: ["PERPLEXITY::*", "FIRECRAWL::*"],
    state: StateSchema,
  },
  tools,
  prompts,
  resources,
});

serve(runtime.fetch);
