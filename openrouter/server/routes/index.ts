/**
 * API Routes
 * Custom routes for operations that don't fit the MCP tool pattern
 */

import type { Env } from "../main.ts";
import { handleStreamRoute } from "./stream.ts";

/**
 * Handle custom API routes
 */
export async function handleCustomRoutes(
  request: Request,
  env: Env,
): Promise<Response | null> {
  const url = new URL(request.url);

  // Handle OPTIONS for CORS
  if (request.method === "OPTIONS") {
    return new Response(null, {
      status: 204,
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
        "Access-Control-Allow-Headers": "Content-Type",
      },
    });
  }

  // Streaming endpoint
  if (url.pathname.startsWith("/api/stream/")) {
    return handleStreamRoute(request, env);
  }

  // No matching route
  return null;
}
