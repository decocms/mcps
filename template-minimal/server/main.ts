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
 * - Optional: OAuth, event handlers, etc.
 */
const runtime = withRuntime<Env, typeof StateSchema>({
  configuration: {
    // Uncomment if you need configuration scopes for bindings:
    // scopes: [
    //   "DATABASE::DATABASES_RUN_SQL",
    //   "EVENT_BUS::*",
    //   "CONNECTION::*",
    // ],
    state: StateSchema,
  },

  // Register tools (functions that can be called by agents)
  tools,

  // Uncomment to add event handlers:
  // events: {
  //   handlers: {
  //     SELF: {
  //       events: ["my.event.type"],
  //       handler: async ({ events }, env) => {
  //         for (const event of events) {
  //           // Process event
  //         }
  //         return { success: true };
  //       },
  //     },
  //   },
  // },

  // Uncomment to add OAuth (example: Google):
  // oauth: createGoogleOAuth({
  //   scopes: ["https://www.googleapis.com/auth/calendar"],
  // }),
});

// Start the server
if (runtime.fetch) {
  serve(runtime.fetch);
}
