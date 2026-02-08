/**
 * Virtual Try-On MCP
 *
 * Receives a person photo + garment images and delegates generation to an image generator MCP.
 */
import { withRuntime } from "@decocms/runtime";
import { serve } from "@decocms/mcps-shared/serve";

import { tools } from "./tools/index.ts";
import { type Env, StateSchema } from "./types/env.ts";

export type { Env };

const runtime = withRuntime<Env, typeof StateSchema>({
  configuration: {
    state: StateSchema,
  },
  tools,
});

serve(runtime.fetch);
