/**
 * Perplexity MCP Server
 *
 * This MCP provides tools for interacting with Perplexity AI API,
 * including single prompts and multi-turn conversations with web-backed answers.
 */
import { withRuntime } from "@decocms/runtime";
import { serve } from "@decocms/mcps-shared/serve";

import { tools } from "./tools/index.ts";
import type { Env } from "../shared/deco.gen.ts";

export type { Env };

const runtime = withRuntime<Env>({
  tools: (env: Env) => tools.map((createTool) => createTool(env)),
});

if (runtime.fetch) {
  serve(runtime.fetch);
}
