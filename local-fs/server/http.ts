#!/usr/bin/env node
/**
 * MCP Local FS - HTTP Entry Point
 *
 * Usage:
 *   npx @decocms/mcp-local-fs --http --path /path/to/mount
 *   curl http://localhost:3456/mcp?path=/my/folder
 *
 * The path can be provided via:
 *   1. Query string: ?path=/my/folder
 *   2. --path CLI flag
 *   3. MCP_LOCAL_FS_PATH environment variable
 */

import {
  createServer,
  type IncomingMessage,
  type ServerResponse,
} from "node:http";
import { spawn } from "node:child_process";
import { platform } from "node:os";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { LocalFileStorage } from "./storage.js";
import { registerTools } from "./tools.js";
import { resolve } from "node:path";

/**
 * Copy text to clipboard (cross-platform)
 */
function copyToClipboard(text: string): Promise<boolean> {
  return new Promise((resolvePromise) => {
    const os = platform();
    let cmd: string;
    let args: string[];

    if (os === "darwin") {
      cmd = "pbcopy";
      args = [];
    } else if (os === "win32") {
      cmd = "clip";
      args = [];
    } else {
      // Linux - try xclip first, then xsel
      cmd = "xclip";
      args = ["-selection", "clipboard"];
    }

    try {
      const proc = spawn(cmd, args, { stdio: ["pipe", "ignore", "ignore"] });
      proc.stdin?.write(text);
      proc.stdin?.end();
      proc.on("close", (code) => resolvePromise(code === 0));
      proc.on("error", () => resolvePromise(false));
    } catch {
      resolvePromise(false);
    }
  });
}

/**
 * Create an MCP server for a given filesystem path
 */
function createMcpServerForPath(rootPath: string): McpServer {
  const storage = new LocalFileStorage(rootPath);

  const server = new McpServer({
    name: "local-fs",
    version: "1.0.0",
  });

  // Register all tools from shared module
  registerTools(server, storage);

  return server;
}

// Parse CLI args for port and path
function getPort(): number {
  const args = process.argv.slice(2);
  for (let i = 0; i < args.length; i++) {
    if (args[i] === "--port" || args[i] === "-p") {
      const port = parseInt(args[i + 1], 10);
      if (!isNaN(port)) return port;
    }
  }
  return parseInt(process.env.PORT || "3456", 10);
}

function getDefaultPath(): string {
  const args = process.argv.slice(2);

  // Check for explicit --path flag
  for (let i = 0; i < args.length; i++) {
    if (args[i] === "--path" || args[i] === "-d") {
      const path = args[i + 1];
      if (path && !path.startsWith("-")) return path;
    }
  }

  // Check for positional argument (skip flags and their values)
  const skipNext = new Set<number>();
  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    // Skip flag values
    if (skipNext.has(i)) continue;
    // Mark next arg to skip if this is a flag with value
    if (arg === "--port" || arg === "-p" || arg === "--path" || arg === "-d") {
      skipNext.add(i + 1);
      continue;
    }
    // Skip flags
    if (arg.startsWith("-")) continue;
    // This is a positional argument - use it as path
    return arg;
  }

  return process.env.MCP_LOCAL_FS_PATH || process.cwd();
}

const port = getPort();
const defaultPath = resolve(getDefaultPath());

// Session TTL in milliseconds (30 minutes)
const SESSION_TTL_MS = 30 * 60 * 1000;

// Store active transports for session management with timestamps
const transports = new Map<
  string,
  { transport: StreamableHTTPServerTransport; lastAccess: number }
>();

// Cleanup stale sessions periodically (every 5 minutes)
const cleanupInterval = setInterval(
  () => {
    const now = Date.now();
    for (const [sessionId, session] of transports) {
      if (now - session.lastAccess > SESSION_TTL_MS) {
        transports.delete(sessionId);
        console.log(`[mcp-local-fs] Session expired: ${sessionId}`);
      }
    }
  },
  5 * 60 * 1000,
);

// Cleanup on process exit
process.on("SIGINT", () => {
  clearInterval(cleanupInterval);
  process.exit(0);
});
process.on("SIGTERM", () => {
  clearInterval(cleanupInterval);
  process.exit(0);
});

// Create HTTP server
const httpServer = createServer(
  async (req: IncomingMessage, res: ServerResponse) => {
    try {
      const url = new URL(req.url || "/", `http://localhost:${port}`);

      // CORS headers
      res.setHeader("Access-Control-Allow-Origin", "*");
      res.setHeader(
        "Access-Control-Allow-Methods",
        "GET, POST, DELETE, OPTIONS",
      );
      res.setHeader(
        "Access-Control-Allow-Headers",
        "Content-Type, mcp-session-id",
      );

      if (req.method === "OPTIONS") {
        res.writeHead(204);
        res.end();
        return;
      }

      // Info endpoint
      if (url.pathname === "/" && req.method === "GET") {
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(
          JSON.stringify({
            name: "mcp-local-fs",
            version: "1.0.0",
            description: "MCP server that mounts any local filesystem path",
            endpoints: {
              mcp: "/mcp?path=/your/path",
              mcpWithPath: "/mcp/your/path",
              health: "/health",
            },
            defaultPath,
          }),
        );
        return;
      }

      // Health check
      if (url.pathname === "/health" && req.method === "GET") {
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ status: "ok" }));
        return;
      }

      // MCP endpoint
      if (url.pathname.startsWith("/mcp")) {
        // Get path from query string or URL path
        let mountPath = defaultPath;
        const queryPath = url.searchParams.get("path");
        if (queryPath) {
          mountPath = resolve(queryPath);
        } else if (
          url.pathname !== "/mcp" &&
          url.pathname.startsWith("/mcp/")
        ) {
          const pathFromUrl = url.pathname.replace("/mcp/", "");
          mountPath = resolve("/" + decodeURIComponent(pathFromUrl));
        }

        console.log(`[mcp-local-fs] Request for path: ${mountPath}`);

        // Get or create session
        const sessionId = req.headers["mcp-session-id"] as string | undefined;

        if (req.method === "POST") {
          // Check for existing session
          let session = sessionId ? transports.get(sessionId) : undefined;

          if (!session) {
            // Create new transport and server for this session
            const mcpServer = createMcpServerForPath(mountPath);
            const newTransport = new StreamableHTTPServerTransport({
              sessionIdGenerator: () => crypto.randomUUID(),
              onsessioninitialized: (newSessionId) => {
                transports.set(newSessionId, {
                  transport: newTransport,
                  lastAccess: Date.now(),
                });
                console.log(
                  `[mcp-local-fs] Session initialized: ${newSessionId}`,
                );
              },
            });

            // Connect server to transport
            await mcpServer.connect(newTransport);

            // Handle the request
            await newTransport.handleRequest(req, res);
            return;
          }

          // Update last access time
          session.lastAccess = Date.now();

          // Handle the request
          await session.transport.handleRequest(req, res);
          return;
        }

        if (req.method === "GET") {
          // SSE connection for server-sent events
          const session = sessionId ? transports.get(sessionId) : undefined;
          if (session) {
            session.lastAccess = Date.now();
            await session.transport.handleRequest(req, res);
            return;
          }
          res.writeHead(400, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ error: "No session found" }));
          return;
        }

        if (req.method === "DELETE") {
          // Session termination
          const session = sessionId ? transports.get(sessionId) : undefined;
          if (session) {
            await session.transport.handleRequest(req, res);
            transports.delete(sessionId!);
            console.log(`[mcp-local-fs] Session terminated: ${sessionId}`);
            return;
          }
          res.writeHead(404, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ error: "Session not found" }));
          return;
        }
      }

      // 404 for unknown routes
      res.writeHead(404, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: "Not found" }));
    } catch (error) {
      // Top-level error handler
      console.error("[mcp-local-fs] Request error:", error);
      if (!res.headersSent) {
        res.writeHead(500, { "Content-Type": "application/json" });
        res.end(
          JSON.stringify({
            error: "Internal server error",
            message: error instanceof Error ? error.message : "Unknown error",
          }),
        );
      }
    }
  },
);

// Build the full MCP URL
const mcpUrl = `http://localhost:${port}/mcp${defaultPath}`;

// Copy to clipboard and show startup banner
(async () => {
  const copied = await copyToClipboard(mcpUrl);

  console.log(`
╔════════════════════════════════════════════════════════════╗
║                    MCP Local FS Server                     ║
╠════════════════════════════════════════════════════════════╣
║  HTTP server running on port ${port.toString().padEnd(27)}║
║  Default path: ${defaultPath.slice(0, 41).padEnd(41)}║
║                                                            ║
║  MCP URL (${copied ? "copied to clipboard ✓" : "copy this"}):
║  ${mcpUrl}
║                                                            ║
║  Endpoints:                                                ║
║    GET  /           Server info                            ║
║    GET  /health     Health check                           ║
║    POST /mcp        MCP endpoint (use ?path=...)           ║
║    POST /mcp/*      MCP endpoint with path in URL          ║
╚════════════════════════════════════════════════════════════╝
`);
})();

httpServer.listen(port);
