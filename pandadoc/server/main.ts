/**
 * PandaDoc MCP Proxy Server
 *
 * Proxies all MCP requests to the official PandaDoc MCP server
 * (https://developers.pandadoc.com/mcp), rewriting the Authorization header
 * from "Bearer <token>" to "API-Key <token>" as required by PandaDoc.
 */
import { serve } from "@decocms/mcps-shared/serve";

const PANDADOC_MCP_URL = "https://developers.pandadoc.com/mcp";

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers":
    "Authorization, Content-Type, Accept, x-request-id",
};

/**
 * Extracts the raw API key from an Authorization header value.
 * Accepts both "Bearer <token>" and plain "<token>" formats.
 */
function extractToken(authorization: string): string {
  if (authorization.startsWith("Bearer ")) {
    return authorization.slice("Bearer ".length).trim();
  }
  if (authorization.startsWith("API-Key ")) {
    return authorization.slice("API-Key ".length).trim();
  }
  return authorization.trim();
}

async function handler(req: Request): Promise<Response> {
  const url = new URL(req.url);

  // Health check endpoint
  if (url.pathname === "/health") {
    return new Response(JSON.stringify({ status: "ok" }), {
      headers: { "content-type": "application/json", ...CORS_HEADERS },
    });
  }

  // Handle CORS preflight — must respond before auth check
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: CORS_HEADERS });
  }

  // Forward all /mcp* requests to PandaDoc
  const authorization = req.headers.get("Authorization") ?? "";
  const token = extractToken(authorization);

  if (!token) {
    return new Response(
      JSON.stringify({ error: "Missing Authorization header" }),
      {
        status: 401,
        headers: { "content-type": "application/json", ...CORS_HEADERS },
      },
    );
  }

  // Build forwarded headers — replace Authorization with PandaDoc's expected format
  const forwardedHeaders = new Headers(req.headers);
  forwardedHeaders.set("Authorization", `API-Key ${token}`);
  // PandaDoc MCP requires both application/json and text/event-stream (SSE)
  forwardedHeaders.set("Accept", "application/json, text/event-stream");
  // Remove host header so it doesn't conflict with the upstream
  forwardedHeaders.delete("host");

  // Determine upstream URL (preserve path + query after /mcp)
  const upstreamPath = url.pathname.replace(/^\/?mcp/, "") || "";
  const upstreamUrl = `${PANDADOC_MCP_URL}${upstreamPath}${url.search}`;

  const upstreamResponse = await fetch(upstreamUrl, {
    method: req.method,
    headers: forwardedHeaders,
    body: req.body,
    // @ts-ignore — Bun-specific: disable body auto-decompression for streaming
    duplex: "half",
  });

  // Merge upstream headers with CORS headers
  const responseHeaders = new Headers(upstreamResponse.headers);
  for (const [key, value] of Object.entries(CORS_HEADERS)) {
    responseHeaders.set(key, value);
  }

  // Stream response back to client
  return new Response(upstreamResponse.body, {
    status: upstreamResponse.status,
    statusText: upstreamResponse.statusText,
    headers: responseHeaders,
  });
}

serve(handler);
