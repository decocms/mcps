/**
 * Task Runner MCP Server
 *
 * This MCP provides tools for orchestrating AI agents through task lists:
 * - Beads CLI integration for task storage
 * - Ralph-style execution loops
 * - Agent calling and budget control
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
  const port = process.env.PORT || 8100;
  console.log(`\n  MCP URL: http://localhost:${port}/mcp\n`);
  serve(runtime.fetch);
}
