/**
 * LLM Integration for Slack MCP
 *
 * Calls the Mesh models API directly to generate responses.
 * The system_prompt is automatically injected by Mesh based on the agent configuration.
 */

import { jsonSchema, parseJsonEventStream } from "ai";

const DEFAULT_LANGUAGE_MODEL = "anthropic/claude-4.5-sonnet";

// Schema for AI SDK stream events
const streamEventSchema = jsonSchema<{
  type: string;
  delta?: string;
  toolCallId?: string;
  toolName?: string;
  args?: string;
  result?: unknown;
  output?: unknown;
  finishReason?: string;
}>({
  type: "object",
  properties: {
    type: { type: "string" },
    delta: { type: "string" },
    toolCallId: { type: "string" },
    toolName: { type: "string" },
    args: { type: "string" },
    result: {},
    output: {},
    finishReason: { type: "string" },
  },
  required: ["type"],
});

export interface LLMConfig {
  meshUrl: string;
  organizationId: string;
  token: string;
  modelProviderId: string;
  modelId?: string;
  agentId?: string;
}

export interface Message {
  role: "user" | "assistant" | "system";
  content: string;
}

/**
 * Generate a response from the LLM via Mesh API
 *
 * The system_prompt configured in the agent/gateway is automatically
 * injected by Mesh - no need to fetch it separately.
 */
export async function generateLLMResponse(
  messages: Message[],
  config: LLMConfig,
): Promise<string> {
  const {
    meshUrl,
    organizationId,
    token,
    modelProviderId,
    modelId = DEFAULT_LANGUAGE_MODEL,
    agentId,
  } = config;

  // Use localhost directly to avoid tunnel network issues
  const effectiveMeshUrl =
    meshUrl.includes("localhost-") && meshUrl.includes(".deco.host")
      ? "http://localhost:3000"
      : meshUrl;

  // Build messages - Mesh will inject the agent's system_prompt automatically
  const allMessages = messages.map((m) => ({
    role: m.role,
    parts: [{ type: "text", text: m.content }],
  }));

  const requestBody = {
    model: {
      connectionId: modelProviderId,
      id: modelId,
    },
    messages: allMessages,
    stream: true,
    gateway: { id: agentId ?? null },
  };

  const response = await fetch(
    `${effectiveMeshUrl}/api/${organizationId}/models/stream`,
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
    const errorText = await response.text();
    console.error("[LLM] API Error", {
      status: response.status,
      error: errorText,
    });
    throw new Error(
      `Mesh API error (${response.status}): ${errorText || response.statusText}`,
    );
  }

  if (!response.body) {
    throw new Error("No response body from LLM API");
  }

  // Process the stream and collect text
  let textContent = "";
  let lastTextContent = "";

  try {
    const eventStream = parseJsonEventStream({
      stream: response.body,
      schema: streamEventSchema,
    });

    const reader = eventStream.getReader();
    while (true) {
      const { done, value: event } = await reader.read();
      if (done) break;
      if (!event.success) continue;

      const { type } = event.value;

      if (type === "text-delta" && event.value.delta) {
        textContent += event.value.delta;
      } else if (type === "text-end") {
        // Save the current text but DON'T break - there may be more tool calls
        lastTextContent = textContent;
      } else if (type === "finish") {
        break;
      }
    }
  } catch (error) {
    console.error("[LLM] Stream processing error:", error);
    if (textContent || lastTextContent) {
      return textContent || lastTextContent;
    }
    throw error;
  }

  return textContent || "Desculpe, não consegui gerar uma resposta.";
}
