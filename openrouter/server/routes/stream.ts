/**
 * Streaming Route
 * Handles Server-Sent Events (SSE) streaming for chat completions
 */

import type { Env } from "../main.ts";
import { OpenRouterClient } from "../lib/openrouter-client.ts";
import { isSessionExpired } from "../tools/chat/utils.ts";
import type { StreamingSession } from "../lib/types.ts";

/**
 * Handle streaming chat completion via SSE
 */
export async function handleStreamRoute(
  request: Request,
  env: Env,
): Promise<Response> {
  const url = new URL(request.url);
  const sessionId = url.pathname.split("/").pop();

  if (!sessionId) {
    return new Response(JSON.stringify({ error: "Session ID is required" }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }

  // Get session from global storage
  // Note: In production, use Cloudflare KV or Durable Objects
  // @ts-ignore - globalThis is extended at runtime
  const sessions =
    (globalThis.streamingSessions as
      | Map<string, StreamingSession>
      | undefined) || new Map();
  const session = sessions.get(sessionId);

  if (!session) {
    return new Response(
      JSON.stringify({ error: "Session not found or expired" }),
      {
        status: 404,
        headers: { "Content-Type": "application/json" },
      },
    );
  }

  // Check if session is expired
  if (isSessionExpired(session)) {
    sessions.delete(sessionId);
    return new Response(JSON.stringify({ error: "Session expired" }), {
      status: 410,
      headers: { "Content-Type": "application/json" },
    });
  }

  // Create OpenRouter client
  const client = new OpenRouterClient({
    apiKey: env.state.apiKey,
    siteName: env.state.siteName,
    siteUrl: env.state.siteUrl,
  });

  // Create SSE stream
  const { readable, writable } = new TransformStream();
  const writer = writable.getWriter();
  const encoder = new TextEncoder();

  // Start streaming in background
  (async () => {
    try {
      const stream = client.streamChatCompletion(session.params);

      for await (const chunk of stream) {
        // Send chunk as SSE
        const data = `data: ${JSON.stringify(chunk)}\n\n`;
        await writer.write(encoder.encode(data));
      }

      // Send completion signal
      await writer.write(encoder.encode("data: [DONE]\n\n"));
    } catch (error) {
      // Send error as SSE
      const errorData = {
        error: {
          message: error instanceof Error ? error.message : "Unknown error",
          type: "stream_error",
        },
      };
      await writer.write(
        encoder.encode(`data: ${JSON.stringify(errorData)}\n\n`),
      );
    } finally {
      // Clean up session
      sessions.delete(sessionId);
      await writer.close();
    }
  })();

  return new Response(readable, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type",
    },
  });
}
