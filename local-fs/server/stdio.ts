#!/usr/bin/env node
/**
 * MCP Local FS - Stdio Entry Point
 *
 * This is the main entry point for running the MCP server via stdio,
 * which is the standard transport for CLI-based MCP servers.
 *
 * Usage:
 *   npx @decocms/mcp-local-fs /path/to/mount
 *   npx @decocms/mcp-local-fs --path /path/to/mount
 */

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { LocalFileStorage } from "./storage.js";
import { registerTools } from "./tools.js";
import { logStart } from "./logger.js";
import { resolve } from "node:path";

/**
 * Parse CLI arguments to get the path to mount
 */
function getPathFromArgs(): string {
  const args = process.argv.slice(2);

  // Check for --path flag
  for (let i = 0; i < args.length; i++) {
    if (args[i] === "--path" || args[i] === "-p") {
      const path = args[i + 1];
      if (path && !path.startsWith("-")) {
        return path;
      }
    }
  }

  // Check for positional argument (first non-flag argument)
  for (const arg of args) {
    if (!arg.startsWith("-")) {
      return arg;
    }
  }

  // Check environment variable
  if (process.env.MCP_LOCAL_FS_PATH) {
    return process.env.MCP_LOCAL_FS_PATH;
  }

  // Default to current working directory
  return process.cwd();
}

/**
 * Create and start the MCP server with stdio transport
 */
async function main() {
  const mountPath = getPathFromArgs();
  const resolvedPath = resolve(mountPath);

  // Create storage instance
  const storage = new LocalFileStorage(resolvedPath);

  // Create MCP server
  const server = new McpServer({
    name: "local-fs",
    version: "1.0.0",
  });

  // Register all tools
  registerTools(server, storage);

  // Connect to stdio transport
  const transport = new StdioServerTransport();
  await server.connect(transport);

  // Log startup (goes to stderr, nicely formatted)
  logStart(resolvedPath);
}

main().catch((error) => {
  console.error("Fatal error:", error);
  process.exit(1);
});
