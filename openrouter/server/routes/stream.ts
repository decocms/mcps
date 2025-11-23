import type { Env } from "../main.ts";
import { OPENROUTER_BASE_URL, OPENROUTER_CHAT_ENDPOINT } from "../constants.ts";
import { getOpenRouterApiKey } from "../lib/env.ts";

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
};

const JSON_HEADERS = {
  ...CORS_HEADERS,
  "Content-Type": "application/json",
};

/**
 * Handle streaming chat completion as a transparent proxy to OpenRouter
 */
export async function handleStreamRoute(
  request: Request,
  env: Env,
): Promise<Response> {
  if (request.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: CORS_HEADERS });
  }

  if (request.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method Not Allowed" }), {
      status: 405,
      headers: JSON_HEADERS,
    });
  }

  const apiKey = getOpenRouterApiKey(env);
  const openRouterUrl = `${OPENROUTER_BASE_URL}${OPENROUTER_CHAT_ENDPOINT}`;

  // Forward request to OpenRouter with adjusted headers
  const headers = new Headers(request.headers);

  // Override/add specific headers
  headers.set("Authorization", `Bearer ${apiKey}`);
  headers.set("HTTP-Referer", request.headers.get("Referer") || "");
  headers.set("X-Title", "Deco OpenRouter MCP");

  return await fetch(openRouterUrl, {
    method: request.method,
    // eslint-disable-next-line eslint-plugin-unicorn(no-invalid-fetch-options)
    body: request.body,
    headers,
  });
}
