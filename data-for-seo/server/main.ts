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
console.log("[DataForSEO Main] Initializing runtime...");
console.log("[DataForSEO Main] Total tools to register:", tools.length);

const runtime = withRuntime<Env, typeof StateSchema>({
  configuration: {
    state: StateSchema,
    onChange: async (env) => {
      console.log("[DataForSEO Main] 🔄 Configuration changed!");
      console.log(
        "[DataForSEO Main] MESH_REQUEST_CONTEXT exists:",
        !!env.MESH_REQUEST_CONTEXT,
      );
      console.log(
        "[DataForSEO Main] state exists:",
        !!env.MESH_REQUEST_CONTEXT?.state,
      );

      const state = env.MESH_REQUEST_CONTEXT?.state;
      if (state) {
        console.log("[DataForSEO Main] State keys:", Object.keys(state));
        if (state.API_CREDENTIALS) {
          console.log(
            "[DataForSEO Main] ✅ Credentials configured - login:",
            state.API_CREDENTIALS.login?.substring(0, 5) + "...",
          );
        } else {
          console.log("[DataForSEO Main] ⚠️ No API_CREDENTIALS in state");
        }
      } else {
        console.log("[DataForSEO Main] ⚠️ State is null/undefined");
      }
    },
  },

  // Register tools (functions that can be called by agents)
  tools,
});

console.log("[DataForSEO Main] Runtime initialized successfully");

// Start the server
if (runtime.fetch) {
  serve(runtime.fetch);
}
