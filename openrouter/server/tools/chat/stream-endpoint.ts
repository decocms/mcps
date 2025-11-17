/**
 * Tool: Get Chat Metadata
 * Provides discovery info for the streaming HTTP endpoint.
 */

import { createPrivateTool } from "@decocms/runtime/mastra";
import { z } from "zod";
import type { Env } from "../../main.ts";

const STREAM_DOCS_URL = "https://openrouter.ai/docs/api-reference/streaming";
const AI_SDK_URL = "https://github.com/vercel/ai";
const DEFAULT_BASE_URL = "https://openrouter.deco.page";

export const createGetStreamEndpointTool = (env: Env) =>
  createPrivateTool({
    id: "OPENROUTER_GET_STREAM_ENDPOINT",
    description:
      "Return details about the HTTP streaming endpoint so clients can connect without guessing configuration.",
    inputSchema: z.object({}).optional(),
    outputSchema: z.object({
      apiBaseUrl: z.string().url(),
      chatEndpoint: z.string().url(),
      method: z.literal("POST"),
      contentType: z.literal("application/json"),
      stream: z.literal(true),
      description: z.string(),
      docs: z.array(
        z.object({
          title: z.string(),
          url: z.string().url(),
        }),
      ),
      notes: z.array(z.string()),
    }),
    execute: async () => {
      const state = env.DECO_CHAT_REQUEST_CONTEXT.state;
      const baseUrl = (state.siteUrl || DEFAULT_BASE_URL).replace(/\/$/, "");
      const chatEndpoint = `${baseUrl}/api/chat`;

      return {
        apiBaseUrl: baseUrl,
        chatEndpoint,
        method: "POST" as const,
        contentType: "application/json" as const,
        stream: true as const,
        description:
          "POST JSON payloads identical to the OPENROUTER_CHAT_COMPLETION tool and receive a Server-Sent Events stream compatible with OpenRouter's streaming protocol.",
        docs: [
          { title: "OpenRouter Streaming", url: STREAM_DOCS_URL },
          { title: "Vercel AI SDK", url: AI_SDK_URL },
        ],
        notes: [
          "Set the same fields you would send to OPENROUTER_CHAT_COMPLETION; the response is a text/event-stream with OpenRouter chunks.",
          "Ideal for hooking up to vercel/ai useChat hooks or any SSE client.",
          "Include apiKey/site attribution when calling from your runtime; this MCP only stores them inside the installation state.",
        ],
      };
    },
  });
