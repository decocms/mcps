#!/usr/bin/env node
/**
 * MCP Studio - Stdio Entry Point
 *
 * This is the main entry point for running the MCP server via stdio,
 * which is the standard transport for CLI-based MCP servers.
 *
 * Usage:
 *   bun run stdio                        # Run directly
 *   bun run dev:stdio                    # Run with hot reload
 *
 * In Mesh, add as STDIO connection:
 *   Command: bun
 *   Args: /path/to/mcp-studio/server/stdio.ts
 *
 * Environment variables (passed by Mesh automatically):
 *   MESH_URL   - Base URL of the Mesh instance (e.g., https://mesh.example.com)
 *   MESH_TOKEN - JWT token for authenticating with Mesh API
 *   MESH_STATE - JSON with binding connection IDs:
 *                {"DATABASE":{"__type":"@deco/postgres","value":"conn-id"}, ...}
 *
 * Optional environment variables:
 *   WORKFLOWS_DIR   - Directory to load workflows from (enables filesystem mode)
 *   WORKFLOW_FILES  - Comma-separated list of workflow JSON files
 */

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { registerStdioTools } from "./stdio-tools.ts";

/**
 * Create and start the MCP server with stdio transport
 */
async function main() {
  console.error("[mcp-studio] Starting MCP Studio via stdio transport...");

  // Create MCP server
  const server = new McpServer({
    name: "mcp-studio",
    version: "1.0.0",
  });

  // Register all tools (this also initializes bindings from env vars)
  await registerStdioTools(server);

  // Connect to stdio transport
  const transport = new StdioServerTransport();
  await server.connect(transport);

  // Log startup summary
  console.error("[mcp-studio] ✅ MCP server running via stdio");
  console.error(
    "[mcp-studio] Available: Workflow, Execution, Assistant, and Prompt tools",
  );

  // Log binding status
  const hasMeshConfig =
    process.env.MESH_URL && process.env.MESH_TOKEN && process.env.MESH_STATE;
  if (hasMeshConfig) {
    console.error("[mcp-studio] ✅ Mesh bindings configured from environment");
  } else {
    console.error("[mcp-studio] ⚠️ No Mesh bindings in environment");
    console.error(
      "[mcp-studio]   Waiting for ON_MCP_CONFIGURATION or configure bindings in Mesh UI",
    );
    if (!process.env.MESH_URL)
      console.error("[mcp-studio]   Missing: MESH_URL");
    if (!process.env.MESH_TOKEN)
      console.error("[mcp-studio]   Missing: MESH_TOKEN");
    if (!process.env.MESH_STATE)
      console.error("[mcp-studio]   Missing: MESH_STATE");
  }
}

main().catch((error) => {
  console.error("[mcp-studio] Fatal error:", error);
  process.exit(1);
});
