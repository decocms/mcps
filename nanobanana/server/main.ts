/**
 * Nano Banana MCP - Image Generation Server
 *
 * Entry point for the MCP server that generates images
 * using Gemini models via OpenRouter.
 */
import { withRuntime } from "@decocms/runtime";
import { serve } from "@decocms/mcps-shared/serve";

import { tools } from "./tools/index.ts";
import { type Env, StateSchema } from "./types/env.ts";

export type { Env };
export { StateSchema };

const runtime = withRuntime<Env, typeof StateSchema>({
  configuration: {
    scopes: [
      "NANOBANANA_CONTRACT::CONTRACT_AUTHORIZE",
      "NANOBANANA_CONTRACT::CONTRACT_SETTLE",
      "FILE_SYSTEM::FS_WRITE",
      "FILE_SYSTEM::FS_READ",
    ],
    state: StateSchema,
  },
  tools: (env: Env) => tools.map((createTool) => createTool(env)),
});

if (runtime.fetch) {
  serve(runtime.fetch);
}
