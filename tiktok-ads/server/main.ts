/**
 * TikTok Ads MCP Server
 *
 * This MCP provides tools for interacting with TikTok Marketing API,
 * including campaign management, ad groups, ads, and performance reports.
 */
import { DefaultEnv, withRuntime } from "@decocms/runtime";
import { serve } from "@decocms/mcps-shared/serve";

import { tools } from "./tools/index.ts";
import { type Env as DecoEnv, StateSchema } from "./lib/schema.ts";

/**
 * Environment type for TikTok Ads MCP
 * Extends process env with Deco runtime context
 */
export type Env = DefaultEnv & DecoEnv;

const runtime = withRuntime<Env, typeof StateSchema>({
  /**
   * The state schema defines what users fill when installing the App.
   * For TikTok Ads, we need the access token that users generate
   * in the TikTok Developer Portal.
   */
  configuration: {
    state: StateSchema,
  },
  tools: (env) => tools.map((createTool) => createTool(env)),
});

export default runtime;

serve(runtime.fetch);
