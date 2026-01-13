/**
 * HyperDX MCP Server
 *
 * This MCP provides tools for querying HyperDX observability data.
 * The HyperDX API key is passed as a Bearer token in the connection settings.
 */

import { type DefaultEnv, withRuntime } from "@decocms/runtime";
import { serve } from "@decocms/mcps-shared/serve";
import { tools } from "./tools/index.ts";

/**
 * Environment type for the HyperDX MCP
 */
export type Env = DefaultEnv;

const runtime = withRuntime<Env>({
  tools: (env: Env) => tools.map((createTool) => createTool(env)),
});

serve((req: Request) => {
  if (new URL(req.url).pathname === "/_healthcheck") {
    return new Response("OK", { status: 200 });
  }
  // biome-ignore lint/suspicious/noExplicitAny: env comes from process.env
  return runtime.fetch(req, { ...process.env } as any, {});
});
