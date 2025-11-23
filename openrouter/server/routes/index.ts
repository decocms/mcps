/**
 * API Routes
 * Custom routes for operations that don't fit the MCP tool pattern
 */

import type { Env } from "../main.ts";
import { handleStreamRoute } from "./stream.ts";

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

/**
 * Handle custom API routes
 */
export async function handleCustomRoutes(
  request: Request,
  env: Env,
): Promise<Response | null> {
  const url = new URL(request.url);

  if (url.pathname === "/api/v1/chat/completions") {
    if (request.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: CORS_HEADERS });
    }
    return handleStreamRoute(request, env);
  }

  // No matching route
  return null;
}
