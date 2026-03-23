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
  console.log(
    `[LLM] ========== generateLLMResponse (non-streaming) ==========`,
  );
  console.log(
    `[LLM] Config: meshUrl=${config.meshUrl}, model=${config.modelId}, agentId=${config.agentId ?? "none"}, org=${config.organizationId}`,
  );
  console.log(`[LLM] Messages: ${messages.length} total`);
  messages.forEach((m, i) => {
    console.log(
      `[LLM]   [${i}] role=${m.role}, content length=${m.content.length}, images=${m.images?.length ?? 0}`,
    );
  });
  console.log(
    `[LLM] Has system prompt: ${!!config.systemPrompt}, system prompt length: ${config.systemPrompt?.length ?? 0}`,
  );

  const startTime = Date.now();
  try {
    const result = await generateResponse(config, toSharedMessages(messages));
    console.log(
      `[LLM] Response received in ${Date.now() - startTime}ms. Length: ${result.length} chars`,
    );
    console.log(`[LLM] Response preview: "${result.substring(0, 300)}"`);
    return result;
  } catch (error) {
    console.error(
      `[LLM] generateLLMResponse FAILED after ${Date.now() - startTime}ms:`,
      error,
    );
    throw error;
  }
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
  console.log(`[LLM] ========== generateLLMResponseWithStreaming ==========`);
  console.log(
    `[LLM] Config: meshUrl=${config.meshUrl}, model=${config.modelId}, agentId=${config.agentId ?? "none"}, org=${config.organizationId}`,
  );
  console.log(`[LLM] Messages: ${messages.length} total`);
  messages.forEach((m, i) => {
    console.log(
      `[LLM]   [${i}] role=${m.role}, content length=${m.content.length}, images=${m.images?.length ?? 0}`,
    );
  });
  console.log(
    `[LLM] Has system prompt: ${!!config.systemPrompt}, system prompt length: ${config.systemPrompt?.length ?? 0}`,
  );

  const startTime = Date.now();
  let chunkCount = 0;
  try {
    const result = await generateResponseWithStreaming(
      config,
      toSharedMessages(messages),
      (text, isComplete) => {
        chunkCount++;
        if (isComplete) {
          console.log(
            `[LLM] Streaming complete. Total chunks: ${chunkCount}, final length: ${text.length} chars, time: ${Date.now() - startTime}ms`,
          );
          console.log(
            `[LLM] Streaming response preview: "${text.substring(0, 300)}"`,
          );
        }
        onStream(text, isComplete);
      },
    );
    console.log(
      `[LLM] generateLLMResponseWithStreaming finished in ${Date.now() - startTime}ms`,
    );
    return result;
  } catch (error) {
    console.error(
      `[LLM] generateLLMResponseWithStreaming FAILED after ${Date.now() - startTime}ms (chunks received: ${chunkCount}):`,
      error,
    );
    throw error;
  }
}
