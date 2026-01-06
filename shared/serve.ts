/// <reference types="bun" />

/**
 * Shared Bun.serve utility for MCP servers
 *
 * This utility provides a consistent way to serve MCP applications
 * with the correct configuration for SSE endpoints and K8s compatibility.
 */

// Using 'any' for additional args to support both simple fetch handlers
// and runtime.fetch which expects (req, env, ctx)
// biome-ignore lint/suspicious/noExplicitAny: Required for compatibility with runtime.fetch signature
type Fetcher = (req: Request, ...args: any[]) => Response | Promise<Response>;

/**
 * Starts a Bun server with the provided fetch handler.
 *
 * Configures the server with:
 * - idleTimeout: 0 (required for SSE endpoints like notifications)
 * - hostname: 0.0.0.0 (required for K8s)
 * - port: process.env.PORT or 8001
 * - development mode based on NODE_ENV
 *
 * @param fetcher - The fetch handler function
 */
export function serve(fetcher: Fetcher) {
  Bun.serve({
    // This was necessary because MCP has SSE endpoints (like notification) that disconnects after 10 seconds (default bun idle timeout)
    idleTimeout: 0,
    port: process.env.PORT || 8001,
    hostname: "0.0.0.0", // Listen on all network interfaces (required for K8s)
    fetch: fetcher,
    development: process.env.NODE_ENV !== "production",
  });
}
