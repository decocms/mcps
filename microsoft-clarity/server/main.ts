/**
 * Microsoft Clarity MCP Server
 *
 * This MCP provides tools for interacting with Microsoft Clarity Data Export API,
 * including analytics dashboard, session recordings, and documentation access.
 */
import { withRuntime } from "@decocms/runtime";
import { serve } from "@decocms/mcps-shared/serve";

import { tools } from "./tools/index.ts";
import { type Env, StateSchema } from "./types/env.ts";

// Export Env type for use in other files
export type { Env };

/**
 * Configure the MCP runtime
 */
const runtime = withRuntime<Env, typeof StateSchema>({
  configuration: {
    state: StateSchema,
  },

  // Register tools using the factory pattern for each tool
  tools: (env: Env) => tools.map((createTool) => createTool(env)),
});

// Start the server
if (runtime.fetch) {
  serve(runtime.fetch);
}
