/**
 * LLM Integration for Slack MCP
 *
 * Thin wrapper around @decocms/mcps-shared/mesh-chat.
 * Adapts the Slack-specific MessageWithImages format to the shared ChatMessage
 * format and re-exports the types that other Slack modules depend on.
 */

import {
  generateResponse,
  generateResponseWithStreaming,
  type ChatMessage,
  type MeshChatConfig,
  type StreamCallback,
} from "@decocms/mcps-shared/mesh-chat";

export type { MeshChatConfig as LLMConfig, StreamCallback };

/** Slack message format (may include images/audio attachments). */
export interface Message {
  role: "user" | "assistant" | "system";
  content: string;
  images?: Array<{
    type: "image" | "audio";
    data: string;
    mimeType: string;
    name?: string;
  }>;
}

function toSharedMessages(messages: Message[]): ChatMessage[] {
  return messages.map((m) => ({
    role: m.role,
    content: m.content,
    media: m.images?.map((img) => ({
      type: img.type,
      data: img.data,
      mimeType: img.mimeType,
      name: img.name,
    })),
  }));
}

/**
 * Generate a response from the LLM via the Mesh Decopilot API.
 * Returns the full text.
 */
export async function generateLLMResponse(
  messages: Message[],
  config: MeshChatConfig,
): Promise<string> {
  return generateResponse(config, toSharedMessages(messages));
}

/**
 * Generate a response from the LLM with real-time streaming.
 * The callback receives accumulated text on each delta and once more
 * when streaming is complete.
 */
export async function generateLLMResponseWithStreaming(
  messages: Message[],
  config: MeshChatConfig,
  onStream: StreamCallback,
): Promise<string> {
  return generateResponseWithStreaming(
    config,
    toSharedMessages(messages),
    onStream,
  );
}
