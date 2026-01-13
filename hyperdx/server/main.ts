/**
 * HyperDX MCP Server
 *
 * This MCP provides tools for querying HyperDX observability data.
 * The HyperDX API key is passed as a Bearer token in the connection settings.
 */

import { serve } from "@decocms/mcps-shared/serve";
import { type DefaultEnv, withRuntime } from "@decocms/runtime";
import { tools } from "./tools/index.ts";

/**
 * Environment type for the HyperDX MCP
 */
export type Env = DefaultEnv;

const runtime = withRuntime<Env>({
  tools,
  fetch: () => {
    return new Response(
      JSON.stringify({
        name: "hyperdx",
        description: "Query observability data from HyperDX",
        version: "1.0.0",
        endpoints: { mcp: "/mcp" },
      }),
      { headers: { "Content-Type": "application/json" } },
    );
  },
});

const PORT = process.env.PORT || 3000;

serve(runtime.fetch);

console.log(`\n🚀 HyperDX MCP: http://localhost:${PORT}/mcp`);
console.log(`📋 Server ready!\n`);

// Export for Cloudflare Workers deployment
export default runtime;
