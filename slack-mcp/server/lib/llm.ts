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

export interface MessageImage {
  type: "image";
  data: string; // base64
  mimeType: string;
}

export interface Message {
  role: "user" | "assistant" | "system";
  content: string;
  images?: MessageImage[];
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

  // When running locally with a tunnel, use localhost for internal API calls
  // The tunnel URL may not route correctly for server-to-server communication
  const isTunnel = meshUrl.includes(".deco.host");
  const effectiveMeshUrl = isTunnel ? "http://localhost:3000" : meshUrl;

  // Build messages - Mesh will inject the agent's system_prompt automatically
  const allMessages = messages.map((m, msgIndex) => {
    const parts: Array<
      | { type: "text"; text: string }
      | { type: "file"; url: string; filename: string; mediaType: string }
    > = [{ type: "text", text: m.content }];

    // Add images as file parts (Mesh UIMessagePart format)
    if (m.images && m.images.length > 0) {
      for (let i = 0; i < m.images.length; i++) {
        const img = m.images[i];
        // Mesh expects file parts with data URI
        const dataUri = img.data.startsWith("data:")
          ? img.data
          : `data:${img.mimeType};base64,${img.data}`;

        parts.push({
          type: "file",
          url: dataUri,
          filename: `image_${msgIndex}_${i}.${img.mimeType.split("/")[1] || "png"}`,
          mediaType: img.mimeType,
        });

        console.log(
          `[LLM] Added image as file: ${img.mimeType}, ${img.data.length} chars`,
        );
      }
    }

    return { role: m.role, parts };
  });

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

/**
 * Stream callback type for real-time updates
 */
export type StreamCallback = (
  text: string,
  isComplete: boolean,
) => Promise<void>;

/**
 * Generate a response from the LLM via Mesh API with streaming callback
 * This allows updating the Slack message in real-time as the LLM generates text
 */
export async function generateLLMResponseWithStreaming(
  messages: Message[],
  config: LLMConfig,
  onStream: StreamCallback,
): Promise<string> {
  const {
    meshUrl,
    organizationId,
    token,
    modelProviderId,
    modelId = DEFAULT_LANGUAGE_MODEL,
    agentId,
  } = config;

  // When running locally with a tunnel, use localhost for internal API calls
  // The tunnel URL may not route correctly for server-to-server communication
  const isTunnel = meshUrl.includes(".deco.host");
  const effectiveMeshUrl = isTunnel ? "http://localhost:3000" : meshUrl;

  // Build messages (Mesh UIMessagePart format)
  const allMessages = messages.map((m, msgIndex) => {
    const parts: Array<
      | { type: "text"; text: string }
      | { type: "file"; url: string; filename: string; mediaType: string }
    > = [{ type: "text", text: m.content }];

    // Add images as file parts (Mesh UIMessagePart format)
    if (m.images && m.images.length > 0) {
      for (let i = 0; i < m.images.length; i++) {
        const img = m.images[i];
        // Mesh expects file parts with data URI
        const dataUri = img.data.startsWith("data:")
          ? img.data
          : `data:${img.mimeType};base64,${img.data}`;

        parts.push({
          type: "file",
          url: dataUri,
          filename: `image_${msgIndex}_${i}.${img.mimeType.split("/")[1] || "png"}`,
          mediaType: img.mimeType,
        });

        console.log(
          `[LLM Streaming] Added image as file: ${img.mimeType}, ${img.data.length} chars`,
        );
      }
    }

    return { role: m.role, parts };
  });

  const requestBody = {
    model: {
      connectionId: modelProviderId,
      id: modelId,
    },
    messages: allMessages,
    stream: true,
    gateway: { id: agentId ?? null },
  };

  const url = `${effectiveMeshUrl}/api/${organizationId}/models/stream`;
  console.log("[LLM Streaming] Request URL:", url);
  console.log("[LLM Streaming] Organization:", organizationId);
  console.log("[LLM Streaming] Model Provider:", modelProviderId);
  console.log("[LLM Streaming] Agent:", agentId ?? "none");

  const response = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
      Accept: "text/event-stream",
    },
    body: JSON.stringify(requestBody),
  });

  if (!response.ok) {
    const errorText = await response.text();
    console.error("[LLM Streaming] Error:", {
      status: response.status,
      error: errorText,
      url,
      organizationId,
    });
    throw new Error(
      `Mesh API error (${response.status}): ${errorText || response.statusText}`,
    );
  }

  if (!response.body) {
    throw new Error("No response body from LLM API");
  }

  // Process the stream with callbacks
  let textContent = "";
  let lastStreamUpdate = 0;
  const STREAM_UPDATE_INTERVAL = 500; // Update every 500ms to avoid rate limits

  try {
    const eventStream = parseJsonEventStream({
      stream: response.body,
      schema: streamEventSchema,
    });

    const reader = eventStream.getReader();
    let eventCount = 0;
    while (true) {
      const { done, value: event } = await reader.read();
      if (done) {
        console.log(
          `[LLM Streaming] Stream ended. Total events: ${eventCount}, text length: ${textContent.length}`,
        );
        break;
      }

      eventCount++;

      if (!event.success) {
        console.log(`[LLM Streaming] Event ${eventCount} failed:`, event.error);
        continue;
      }

      const { type } = event.value;

      // Log event types (but not all text-delta to avoid spam)
      if (type !== "text-delta" || eventCount <= 3) {
        console.log(`[LLM Streaming] Event ${eventCount}: type=${type}`);
      }

      // Log error events with full details
      if (type === "error") {
        console.error(
          `[LLM Streaming] ERROR event:`,
          JSON.stringify(event.value, null, 2),
        );
      }

      if (type === "text-delta" && event.value.delta) {
        textContent += event.value.delta;

        // Throttle updates to avoid Slack rate limits
        const now = Date.now();
        if (now - lastStreamUpdate > STREAM_UPDATE_INTERVAL) {
          await onStream(textContent, false);
          lastStreamUpdate = now;
        }
      } else if (type === "finish") {
        console.log(
          `[LLM Streaming] Finish event received. Final text length: ${textContent.length}`,
        );
        break;
      }
    }
  } catch (error) {
    console.error("[LLM] Stream processing error:", error);
    if (textContent) {
      await onStream(textContent, true);
      return textContent;
    }
    throw error;
  }

  // Final update with complete text
  await onStream(
    textContent || "Desculpe, não consegui gerar uma resposta.",
    true,
  );
  return textContent || "Desculpe, não consegui gerar uma resposta.";
}
