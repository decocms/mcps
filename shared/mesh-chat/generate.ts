import { callDecopilotAPI } from "./client.ts";
import {
  collectFullStreamText,
  processStreamWithCallback,
} from "./streaming.ts";
import type {
  ChatMessage,
  DecopilotMessage,
  MeshChatConfig,
  StreamCallback,
} from "./types.ts";

function generateMessageId(): string {
  return `msg_${Date.now()}_${Math.random().toString(36).substring(2, 11)}`;
}

/**
 * Convert ChatMessages to the Decopilot UIMessage format.
 *
 * The Decopilot API requires **exactly one non-system message**.
 * All system messages are kept as individual entries; all user/assistant
 * messages are consolidated into a single user message whose parts carry
 * role prefixes for assistant turns so the conversation history is preserved.
 * Media attachments (images, audio) are appended as file parts.
 */
export function messagesToPrompt(
  messages: ChatMessage[],
  systemPrompt?: string,
): DecopilotMessage[] {
  const prompt: DecopilotMessage[] = [];

  if (systemPrompt) {
    prompt.push({
      id: generateMessageId(),
      role: "system",
      parts: [{ type: "text", text: systemPrompt }],
    });
  }

  // Collect system messages first
  for (const msg of messages) {
    if (msg.role === "system") {
      prompt.push({
        id: generateMessageId(),
        role: "system",
        parts: [{ type: "text", text: msg.content }],
      });
    }
  }

  // Consolidate all non-system messages into a single user message.
  // Assistant turns are prefixed with "[assistant]:" so context is preserved.
  const consolidatedParts: DecopilotMessage["parts"] = [];

  for (const msg of messages) {
    if (msg.role === "system") continue;

    if (msg.role === "assistant") {
      consolidatedParts.push({
        type: "text",
        text: `[assistant]: ${msg.content}`,
      });
    } else {
      consolidatedParts.push({ type: "text", text: msg.content });
    }

    for (const media of msg.media ?? []) {
      const dataUri = media.data.startsWith("data:")
        ? media.data
        : `data:${media.mimeType};base64,${media.data}`;

      const filename =
        media.name ?? (media.type === "audio" ? "audio" : "image");

      consolidatedParts.push({
        type: "file",
        url: dataUri,
        filename,
        mediaType: media.mimeType,
      });
    }
  }

  // The Decopilot API requires exactly one non-system message.
  // Always include a user message — use an empty placeholder if no non-system
  // messages were provided (e.g. system-only input).
  prompt.push({
    id: generateMessageId(),
    role: "user",
    parts:
      consolidatedParts.length > 0
        ? consolidatedParts
        : [{ type: "text", text: "" }],
  });

  return prompt;
}

/**
 * Generate a response from the LLM via the Mesh Decopilot API.
 * Collects the full streamed response and returns it as a string.
 */
export async function generateResponse(
  config: MeshChatConfig,
  messages: ChatMessage[],
): Promise<string> {
  const apiMessages = messagesToPrompt(messages, config.systemPrompt);

  console.log("[MeshChat] Generating response", {
    messageCount: apiMessages.length,
    modelId: config.modelId,
    hasAgent: !!config.agentId,
  });

  console.log({config, apiMessages});
  const response = await callDecopilotAPI(config, apiMessages);
  console.log({response});

  if (!response.body) {
    throw new Error("No response body from Decopilot API");
  }

  const text = await collectFullStreamText(response.body);

  console.log(`[MeshChat] Response received (${text.length} chars)`);

  return text || "Desculpe, não consegui gerar uma resposta.";
}

/**
 * Generate a response with real-time streaming via callback.
 * The callback is invoked with accumulated text on each delta and once
 * more with `isComplete: true` when the stream finishes.
 *
 * Returns the full text.
 */
export async function generateResponseWithStreaming(
  config: MeshChatConfig,
  messages: ChatMessage[],
  onStream: StreamCallback,
): Promise<string> {
  const apiMessages = messagesToPrompt(messages, config.systemPrompt);

  console.log("[MeshChat] Generating response (streaming)", {
    messageCount: apiMessages.length,
    modelId: config.modelId,
    hasAgent: !!config.agentId,
  });

  const response = await callDecopilotAPI(config, apiMessages);

  if (!response.body) {
    throw new Error("No response body from Decopilot API");
  }

  return processStreamWithCallback(response.body, onStream);
}
