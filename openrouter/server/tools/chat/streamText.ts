import { createStreamableTool } from "@decocms/runtime/mastra";
import { z } from "zod";
import {
  OPENROUTER_BASE_URL,
  OPENROUTER_CHAT_ENDPOINT,
} from "../../constants.ts";
import { getOpenRouterApiKey } from "../../lib/env.ts";
import type { Env } from "../../main.ts";

export const streamText = (env: Env) =>
  createStreamableTool({
    id: "STREAM_TEXT",
    description: "Stream text",
    inputSchema: z.object({}).passthrough(),
    execute: async ({ context }) => {
      env.DECO_REQUEST_CONTEXT.ensureAuthenticated();

      const apiKey = getOpenRouterApiKey(env);
      const openRouterUrl = `${OPENROUTER_BASE_URL}${OPENROUTER_CHAT_ENDPOINT}`;

      // Forward request to OpenRouter with adjusted headers
      const headers = new Headers();

      // Override/add specific headers
      headers.set("Authorization", `Bearer ${apiKey}`);
      // headers.set("HTTP-Referer", request.headers.get("Referer") || "");
      headers.set("X-Title", "Deco OpenRouter MCP");

      return await fetch(openRouterUrl, {
        method: "POST",
        body: JSON.stringify(context),
        headers,
      });
    },
  });
