/**
 * LLM Integration for Slack MCP
 *
 * Uses MCP bindings to call LLM providers through Mesh,
 * following the same pattern as Mesh's internal LLM calls.
 */

import { LanguageModelBinding } from "@decocms/bindings/llm";

const DEFAULT_LANGUAGE_MODEL = "anthropic/claude-sonnet-4";

// MCP Connection type for HTTP connections
interface MCPConnection {
  type: "HTTP";
  url: string;
  token?: string;
  headers?: Record<string, string>;
}

export interface LLMConfig {
  meshUrl: string;
  organizationId: string;
  token: string;
  modelProviderId: string;
  modelId?: string;
  agentId?: string;
  systemPrompt?: string;
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
 * Create MCP connection to the LLM provider through Mesh proxy
 */
function createLLMConnection(config: LLMConfig): MCPConnection {
  const { meshUrl, modelProviderId, token } = config;

  // When running locally with a tunnel, use localhost for internal API calls
  const isTunnel = meshUrl.includes(".deco.host");
  const effectiveMeshUrl = isTunnel ? "http://localhost:3000" : meshUrl;

  return {
    type: "HTTP",
    url: `${effectiveMeshUrl}/mcp/${modelProviderId}`,
    token,
  };
}

/**
 * Convert messages to LanguageModelV2 prompt format
 */
function messagesToPrompt(
  messages: Message[],
  systemPrompt?: string,
): Array<{
  role: "system" | "user" | "assistant";
  content:
    | string
    | Array<
        | { type: "text"; text: string }
        | { type: "file"; data: string; mediaType: string }
      >;
}> {
  const prompt: Array<{
    role: "system" | "user" | "assistant";
    content:
      | string
      | Array<
          | { type: "text"; text: string }
          | { type: "file"; data: string; mediaType: string }
        >;
  }> = [];

  // Add system prompt if provided
  if (systemPrompt) {
    prompt.push({
      role: "system",
      content: systemPrompt,
    });
  }

  // Convert messages
  for (const msg of messages) {
    if (msg.role === "system") {
      prompt.push({
        role: "system",
        content: msg.content,
      });
    } else if (msg.role === "user") {
      const content: Array<
        | { type: "text"; text: string }
        | { type: "file"; data: string; mediaType: string }
      > = [{ type: "text", text: msg.content }];

      // Add images if present
      if (msg.images && msg.images.length > 0) {
        for (const img of msg.images) {
          const dataUri = img.data.startsWith("data:")
            ? img.data
            : `data:${img.mimeType};base64,${img.data}`;
          content.push({
            type: "file",
            data: dataUri,
            mediaType: img.mimeType,
          });
        }
      }

      prompt.push({
        role: "user",
        content,
      });
    } else if (msg.role === "assistant") {
      prompt.push({
        role: "assistant",
        content: [{ type: "text", text: msg.content }],
      });
    }
  }

  return prompt;
}

/**
 * Generate a response from the LLM via MCP binding
 */
export async function generateLLMResponse(
  messages: Message[],
  config: LLMConfig,
): Promise<string> {
  const { modelId = DEFAULT_LANGUAGE_MODEL, systemPrompt } = config;

  console.log("[LLM] Creating binding connection");
  const connection = createLLMConnection(config);
  const llmBinding = LanguageModelBinding.forConnection(connection);

  const prompt = messagesToPrompt(messages, systemPrompt);

  console.log("[LLM] Calling LLM_DO_GENERATE:", {
    modelId,
    hasSystemPrompt: !!systemPrompt,
    messageCount: prompt.length,
  });

  try {
    const result = await llmBinding.LLM_DO_GENERATE({
      modelId,
      callOptions: {
        prompt: prompt as any,
        maxOutputTokens: 4096,
        temperature: 0.7,
      },
    });

    // Extract text from content
    let text = "";
    for (const part of result.content) {
      if (part.type === "text") {
        text += part.text;
      }
    }

    console.log("[LLM] Response received:", {
      textLength: text.length,
      finishReason: result.finishReason,
    });

    return text || "Desculpe, não consegui gerar uma resposta.";
  } catch (error) {
    console.error("[LLM] Error calling LLM_DO_GENERATE:", error);
    throw error;
  }
}

/**
 * Stream callback type for real-time updates
 */
export type StreamCallback = (
  text: string,
  isComplete: boolean,
) => Promise<void>;

/**
 * Parse stream lines to extract text deltas
 */
function parseStreamLine(
  line: string,
): { type: string; delta?: string } | null {
  const trimmed = line.trim();
  if (!trimmed) return null;
  if (trimmed.startsWith("event:")) return null;
  if (trimmed.startsWith("id:")) return null;
  if (trimmed.startsWith("retry:")) return null;

  let payload = trimmed;
  if (payload.startsWith("data:")) {
    payload = payload.slice("data:".length).trim();
    if (!payload || payload === "[DONE]") return null;
  }

  try {
    return JSON.parse(payload);
  } catch {
    return null;
  }
}

/**
 * Generate a response from the LLM via MCP binding with streaming
 */
export async function generateLLMResponseWithStreaming(
  messages: Message[],
  config: LLMConfig,
  onStream: StreamCallback,
): Promise<string> {
  const { modelId = DEFAULT_LANGUAGE_MODEL, systemPrompt } = config;

  console.log("[LLM Streaming] Creating binding connection");
  const connection = createLLMConnection(config);
  const llmBinding = LanguageModelBinding.forConnection(connection);

  const prompt = messagesToPrompt(messages, systemPrompt);

  console.log("[LLM Streaming] Calling LLM_DO_STREAM:", {
    modelId,
    hasSystemPrompt: !!systemPrompt,
    systemPromptPreview: systemPrompt?.substring(0, 100),
    messageCount: prompt.length,
  });

  try {
    const response = await llmBinding.LLM_DO_STREAM({
      modelId,
      callOptions: {
        prompt: prompt as any,
        maxOutputTokens: 4096,
        temperature: 0.7,
      },
    });

    // The binding returns a Response object with a streaming body
    if (!response.ok) {
      const errorText = await response.text();
      console.error("[LLM Streaming] Error:", {
        status: response.status,
        error: errorText,
      });
      throw new Error(
        `LLM streaming failed (${response.status}): ${errorText}`,
      );
    }

    if (!response.body) {
      throw new Error("No response body from LLM stream");
    }

    // Process the stream
    let textContent = "";
    let lastStreamUpdate = 0;
    const STREAM_UPDATE_INTERVAL = 500;

    const reader = response.body
      .pipeThrough(new TextDecoderStream())
      .getReader();
    let buffer = "";
    let eventCount = 0;

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += value;
      const lines = buffer.split("\n");
      buffer = lines.pop() ?? "";

      for (const line of lines) {
        const parsed = parseStreamLine(line);
        if (!parsed) continue;

        eventCount++;
        const { type } = parsed;

        if (type !== "text-delta" || eventCount <= 3) {
          console.log(`[LLM Streaming] Event ${eventCount}: type=${type}`);
        }

        if (type === "text-delta" && parsed.delta) {
          textContent += parsed.delta;

          const now = Date.now();
          if (now - lastStreamUpdate > STREAM_UPDATE_INTERVAL) {
            await onStream(textContent, false);
            lastStreamUpdate = now;
          }
        } else if (type === "finish") {
          console.log(
            `[LLM Streaming] Finish. Text length: ${textContent.length}`,
          );
          break;
        }
      }
    }

    // Final update
    await onStream(
      textContent || "Desculpe, não consegui gerar uma resposta.",
      true,
    );

    return textContent || "Desculpe, não consegui gerar uma resposta.";
  } catch (error) {
    console.error("[LLM Streaming] Error:", error);
    throw error;
  }
}
