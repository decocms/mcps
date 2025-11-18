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

export const createGetStreamEndpointTool = (_env: Env) =>
  createPrivateTool({
    id: "GET_STREAM_ENDPOINT",
    description:
      "Return details about the HTTP streaming endpoint so clients can connect without guessing configuration.",
    inputSchema: z.object({}).strict(),
    outputSchema: z
      .object({
        url: z.string().url(),
      })
      .passthrough(),
    execute: async () => {
      const baseUrl = DEFAULT_BASE_URL.replace(/\/$/, "");
      const chatEndpoint = `${baseUrl}/api/chat`;

      return {
        url: chatEndpoint,
        method: "POST" as const,
        contentType: "application/json" as const,
        stream: true as const,
        description:
          "POST JSON payloads identical to the CHAT_COMPLETION tool and receive a Server-Sent Events stream compatible with OpenRouter's streaming protocol.",
        docs: [
          { title: "OpenRouter Streaming", url: STREAM_DOCS_URL },
          { title: "Vercel AI SDK", url: AI_SDK_URL },
        ],
        notes: [
          "Set the same fields you would send to CHAT_COMPLETION; the response is a text/event-stream with OpenRouter chunks.",
          "Ideal for hooking up to vercel/ai useChat hooks or any SSE client.",
        ],
        apiBaseUrl: baseUrl,
      };
    },
  });
