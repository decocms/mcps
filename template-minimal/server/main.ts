/**
 * MCP Server - Main Entry Point
 *
 * This is the main entry point for your MCP server.
 * It configures the runtime, registers tools, and starts the server.
 */
import { withRuntime } from "@decocms/runtime";
import { serve } from "@decocms/mcps-shared/serve";
import { withAuth } from "@decocms/mcps-shared/auth";

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

/**
 * Start the server.
 *
 * `withAuth` is mandatory: this MCP is served on a public hostname, so every
 * request must present the shared secret from the AUTH_TOKEN environment
 * variable. It is read at startup — without it the process exits instead of
 * serving anonymous traffic.
 *
 * Do not remove this wrapper. `scripts/check-auth.ts` fails CI if it is gone.
 *
 * If this MCP uses `Authorization` for a per-connection upstream credential
 * (a user's API key), move the shared secret to its own header:
 *
 *   serve(withAuth(runtime.fetch, { header: "x-deco-mcp-auth" }));
 *
 * OAuth callbacks and provider webhooks that third parties call without the
 * secret must be listed explicitly, and carry their own protection:
 *
 *   serve(withAuth(runtime.fetch, { publicPaths: ["/oauth/callback"] }));
 */
if (runtime.fetch) {
  serve(withAuth(runtime.fetch));
}
