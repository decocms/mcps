#!/usr/bin/env node
/**
 * MCP Studio - Stdio Entry Point
 *
 * This is the main entry point for running the MCP server via stdio,
 * which is the standard transport for CLI-based MCP servers.
 *
 * Usage:
 *   bun run server/stdio.ts              # Run directly
 *   bun --watch server/stdio.ts          # Run with hot reload
 *
 * In Mesh, add as custom command:
 *   Command: bun
 *   Args: --watch /path/to/mcp-studio/server/stdio.ts
 *
 * Environment variables:
 *   DATABASE_URL - PostgreSQL connection string (required for workflow operations)
 */

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { registerStdioTools } from "./stdio-tools.ts";

/**
 * Create and start the MCP server with stdio transport
 */
async function main() {
  // Create MCP server
  const server = new McpServer({
    name: "mcp-studio",
    version: "1.0.0",
  });

  // Register all tools
  await registerStdioTools(server);

  // Connect to stdio transport
  const transport = new StdioServerTransport();
  await server.connect(transport);

  // Log startup (goes to stderr so it doesn't interfere with stdio protocol)
  console.error("[mcp-studio] MCP server running via stdio");
  console.error(
    "[mcp-studio] Available: Workflow, Execution, Assistant, and Prompt tools",
  );

  if (!process.env.DATABASE_URL) {
    console.error(
      "[mcp-studio] Warning: DATABASE_URL not set - database operations will fail",
    );
  }
}

main().catch((error) => {
  console.error("Fatal error:", error);
  process.exit(1);
});
