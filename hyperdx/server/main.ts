/**
 * HyperDX MCP Server
 *
 * This MCP provides tools for querying HyperDX observability data.
 * The HyperDX API key is passed as a Bearer token in the connection settings.
 */

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

// Dev mode: print MCP URL and copy to clipboard
if (process.env.NODE_ENV !== "production") {
  const port = process.env.PORT || 8001;
  const mcpUrl = `http://localhost:${port}/mcp`;

  // Copy to clipboard (macOS) - using dynamic import to avoid type issues
  import("child_process").then(({ exec }) => {
    exec(`echo -n "${mcpUrl}" | pbcopy`);
  });

  console.log(`\n🚀 HyperDX MCP: ${mcpUrl}`);
  console.log(`📋 Copied to clipboard!\n`);
}

export default runtime;
