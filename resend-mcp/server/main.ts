/**
 * Resend MCP Server
 *
 * This MCP provides tools for sending transactional and marketing emails
 * via the Resend API.
 */
import { DefaultEnv, withRuntime } from "@decocms/runtime";
import { serve } from "@decocms/mcps-shared/serve";
import { type Env as DecoEnv, StateSchema } from "../shared/deco.gen.ts";

import { tools } from "./tools/index.ts";

/**
 * Environment type for Resend MCP
 * Extends process env with Deco runtime context
 */
export type Env = DefaultEnv & DecoEnv;

const runtime = withRuntime<Env, typeof StateSchema>({
  /**
   * The state schema defines what users fill when installing the App.
   * For Resend MCP, we need the API key and optional default sender configuration.
   */
  oauth: {
    state: StateSchema,
  },
  tools,
});

serve(runtime.fetch);
