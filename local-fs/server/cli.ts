#!/usr/bin/env node
/**
 * MCP Local FS - CLI Entry Point
 *
 * Unified CLI that supports both stdio (default) and http transports.
 *
 * Usage:
 *   npx @decocms/mcp-local-fs /path/to/mount          # stdio mode (default)
 *   npx @decocms/mcp-local-fs --http /path/to/mount   # http mode
 *   npx @decocms/mcp-local-fs --http --port 8080      # http mode with custom port
 */

const args = process.argv.slice(2);

// Check for --http flag
const httpIndex = args.indexOf("--http");
const isHttpMode = httpIndex !== -1;

if (isHttpMode) {
  // Remove --http flag from args before passing to http module
  args.splice(httpIndex, 1);
  process.argv = [process.argv[0], process.argv[1], ...args];

  // Dynamic import of http module
  import("./http.js");
} else {
  // Default to stdio mode
  import("./stdio.js");
}
