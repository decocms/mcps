/**
 * MCP Server - Main Entry Point
 *
 * This is the main entry point for your MCP server.
 * It configures the runtime, registers tools, and starts the server.
 */
import { withRuntime } from "@decocms/runtime";
import { serve } from "@decocms/mcps-shared/serve";

import { tools } from "./tools/index.ts";
import { type Env, StateSchema } from "./types/env.ts";

// Export Env type for use in other files
export type { Env };

/**
 * Configure the MCP runtime
 *
 * This sets up:
 * - Configuration schema (StateSchema)
 * - Tools (from ./tools/index.ts)
 */
const runtime = withRuntime<Env, typeof StateSchema>({
  configuration: {
    state: StateSchema,
  },

  // Register tools (functions that can be called by agents)
  tools,
});

// Start the server
if (runtime.fetch) {
  serve(runtime.fetch);
}
