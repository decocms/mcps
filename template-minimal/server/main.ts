/**
 * MCP Server - Template
 *
 * This is the main entry point for your MCP server.
 * It uses Bun's built-in server and the Deco runtime.
 */
import { type DefaultEnv, withRuntime } from "@decocms/runtime";
import { serve } from "@decocms/mcps-shared/serve";
import { z } from "zod";

import { tools } from "./tools/index.ts";

/**
 * State schema for your MCP configuration.
 * Users will fill this form when installing your MCP.
 *
 * Example: Add an API key field:
 *   apiKey: z.string().describe("Your API key"),
 */
export const StateSchema = z.object({
  // Add your configuration fields here
});

/**
 * Environment type for your MCP.
 * Extends the default Deco environment with your state schema.
 */
export type Env = DefaultEnv<typeof StateSchema>;

const runtime = withRuntime<Env, typeof StateSchema>({
  configuration: {
    state: StateSchema,
  },
  tools,
});

if (runtime.fetch) {
  serve(runtime.fetch);
}
