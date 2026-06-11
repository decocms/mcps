/**
 * Development server wrapper with custom Bun.serve configuration
 *
 * This configures Bun's HTTP server with appropriate timeouts for long-running operations.
 */

import runtime from "./main.ts";

console.log(
  "[DEV_SERVER] 🚀 Starting development server with custom configuration",
);

const PORT = Number.parseInt(Bun.env.PORT ?? "8000");

// IMPORTANT: Bun doesn't expose HTTP request/response timeout configuration
// in Bun.serve. However, MCP over HTTP uses Server-Sent Events (SSE) which
// have built-in keep-alive mechanisms.
//
// Our strategy:
// 1. Use heartbeat logging every 5s to keep the connection active
// 2. Rely on SSE's keep-alive to prevent premature closure
// 3. Set generous timeout (180s) in the tool itself
//
// Default Bun connection behavior:
// - HTTP requests don't timeout by default
// - SSE connections stay open until explicitly closed
// - The client (Cursor/MCP) may have its own timeout

// bun-types@1.3.14 doesn't type idleTimeout yet; runtime.fetch signature differs from Bun's
// eslint-disable-next-line @typescript-eslint/no-explicit-any
Bun.serve({
  port: PORT,
  fetch: runtime.fetch as any,
  development: true,
  // CRITICAL: Default idleTimeout is 10s, too short for image generation (20-30s)
  idleTimeout: 60,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
} as any);

console.log(`[DEV_SERVER] ✅ Server listening on http://localhost:${PORT}`);
console.log(`[DEV_SERVER] 📡 MCP endpoint: http://localhost:${PORT}/mcp`);
console.log(
  "[DEV_SERVER] 💓 Heartbeat logging enabled (every 5s during long operations)",
);
console.log("[DEV_SERVER] ⏱️  HTTP idleTimeout: 180s (Bun.serve config)");
console.log("[DEV_SERVER] ⏱️  Tool timeout: 180s (VIRTUAL_TRY_ON internal)");
