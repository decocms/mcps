/**
 * LLM Module - AI Model Integration
 *
 * Based on mcp-studio/server/llm.ts
 * Calls the Mesh API to generate AI responses using configured model and agent.
 */

import type { Env } from "./types/env.ts";

const DEFAULT_LANGUAGE_MODEL = "anthropic/claude-sonnet-4-20250514";

export interface ChatMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

export interface GenerateResponse {
  content: string;
  model: string;
  tokens?: number;
}

export interface DiscordContext {
  guildId: string;
  channelId: string;
  userId: string;
  userName: string;
}

/**
 * Generate a response using the Mesh API (exactly like mcp-studio)
 */
export async function generateResponse(
  env: Env,
  messages: ChatMessage[],
  options?: {
    discordContext?: DiscordContext;
  },
): Promise<GenerateResponse> {
  // Access MESH_REQUEST_CONTEXT directly like mcp-studio does
  const organizationId = env.MESH_REQUEST_CONTEXT.organizationId;
  if (!organizationId) {
    throw new Error("No organizationId found in MESH_REQUEST_CONTEXT");
  }

  const meshUrl = env.MESH_REQUEST_CONTEXT.meshUrl ?? env.MESH_URL;
  const token = env.MESH_REQUEST_CONTEXT.token;
  const state = env.MESH_REQUEST_CONTEXT.state;

  // Get values directly from state (like mcp-studio)
  const connectionId = state?.MODEL_PROVIDER?.value;
  const modelId = state?.LANGUAGE_MODEL?.value?.id ?? DEFAULT_LANGUAGE_MODEL;
  const agentId = state?.AGENT?.value;

  console.log(`\n╔══════════════════════════════════════════════════════════╗`);
  console.log(`║                   LLM Request                            ║`);
  console.log(`╠══════════════════════════════════════════════════════════╣`);
  console.log(
    `║  Organization:  ${organizationId?.slice(0, 30).padEnd(30)}        ║`,
  );
  console.log(`║  Model:         ${modelId?.slice(0, 30).padEnd(30)}        ║`);
  console.log(`║  Agent/Gateway: ${agentId?.slice(0, 30).padEnd(30)}        ║`);
  console.log(
    `║  Connection:    ${connectionId?.slice(0, 30).padEnd(30)}        ║`,
  );
  console.log(`╚══════════════════════════════════════════════════════════╝\n`);

  // Validate required fields
  if (!connectionId) {
    throw new Error(
      "MODEL_PROVIDER not configured. Please configure it in Mesh.",
    );
  }
  if (!agentId) {
    throw new Error("AGENT not configured. Please configure it in Mesh.");
  }

  // Convert messages to Mesh format
  const meshMessages = messages.map((msg) => ({
    role: msg.role,
    parts: [{ type: "text", text: msg.content }],
  }));

  // Build request body exactly like mcp-studio
  const requestBody = {
    model: {
      connectionId,
      id: modelId,
    },
    gateway: {
      id: agentId,
    },
    messages: meshMessages,
  };

  const response = await fetch(
    `${meshUrl}/api/${organizationId}/models/stream`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
        Accept: "text/event-stream",
      },
      body: JSON.stringify(requestBody),
    },
  );

  if (!response.ok) {
    const errorText = await response.text().catch(() => "");
    throw new Error(
      `Mesh API error (${response.status}): ${errorText || response.statusText}`,
    );
  }

  if (!response.body) {
    throw new Error("No response body from Mesh API");
  }

  // Parse SSE stream
  const content = await parseStreamResponse(response.body);

  return {
    content,
    model: modelId,
  };
}

/**
 * Parse SSE stream response from Mesh API
 */
async function parseStreamResponse(
  body: ReadableStream<Uint8Array>,
): Promise<string> {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let content = "";
  let buffer = "";

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split("\n");
      buffer = lines.pop() || "";

      for (const line of lines) {
        if (line.startsWith("data: ")) {
          const data = line.slice(6).trim();
          if (data === "[DONE]") continue;

          try {
            const event = JSON.parse(data);

            if (event.type === "text-delta" && event.delta) {
              content += event.delta;
            } else if (event.type === "text" && event.text) {
              content += event.text;
            }
          } catch {
            // Ignore parse errors for non-JSON lines
          }
        }
      }
    }
  } finally {
    reader.releaseLock();
  }

  return content;
}
