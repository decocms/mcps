/**
 * LLM Module - AI Model Integration for Discord MCP
 *
 * Uses the new Decopilot API endpoint with UIMessage format.
 * Supports streaming with real-time callbacks for message editing.
 * Based on slack-mcp/server/lib/llm.ts
 */

import type { Env } from "./types/env.ts";

const DEFAULT_LANGUAGE_MODEL = "anthropic/claude-sonnet-4-20250514";
const REQUEST_TIMEOUT_MS = 120000; // 120 seconds

// ============================================================================
// Types
// ============================================================================

export interface ChatMessage {
  role: "system" | "user" | "assistant";
  content: string;
  images?: MessageImage[];
}

export interface MessageImage {
  type: "image" | "audio";
  data: string; // base64
  mimeType: string;
  name?: string;
}

export interface GenerateResponse {
  content: string;
  model: string;
  tokens?: number;
  usedFallback?: boolean;
}

export interface DiscordContext {
  guildId: string;
  channelId: string;
  userId: string;
  userName: string;
}

export interface LLMConfig {
  meshUrl: string;
  organizationId: string;
  token: string;
  modelProviderId: string;
  modelId?: string;
  agentId?: string;
  agentMode?: "passthrough" | "smart_tool_selection" | "code_execution";
  systemPrompt?: string;
}

/**
 * Stream callback type for real-time updates
 */
export type StreamCallback = (
  text: string,
  isComplete: boolean,
) => Promise<void>;

// ============================================================================
// Global LLM Config (set by main.ts)
// ============================================================================

let globalLLMConfig: LLMConfig | null = null;
let streamingEnabled = true;

export function configureLLM(config: LLMConfig): void {
  globalLLMConfig = config;
  console.log("[LLM] Configured", {
    meshUrl: config.meshUrl,
    organizationId: config.organizationId,
    modelProviderId: config.modelProviderId,
    modelId: config.modelId,
    agentId: config.agentId,
    hasToken: !!config.token,
    hasSystemPrompt: !!config.systemPrompt,
  });
}

export function clearLLMConfig(): void {
  globalLLMConfig = null;
  console.log("[LLM] Config cleared");
}

export function configureStreaming(enabled: boolean): void {
  streamingEnabled = enabled;
  console.log("[LLM] Streaming:", enabled ? "enabled" : "disabled");
}

export function isStreamingEnabled(): boolean {
  return streamingEnabled;
}

export function isLLMConfigured(): boolean {
  return globalLLMConfig !== null;
}

export function getLLMConfig(): LLMConfig | null {
  return globalLLMConfig;
}

// ============================================================================
// Message Formatting (UIMessage format)
// ============================================================================

/**
 * Generate unique message ID
 */
function generateMessageId(): string {
  return `msg_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
}

/**
 * Convert messages to Decopilot API format (UIMessage)
 * Format: { id, role, parts: [...] }
 */
function messagesToPrompt(
  messages: ChatMessage[],
  systemPrompt?: string,
): Array<{
  id: string;
  role: "system" | "user" | "assistant";
  parts: Array<
    | { type: "text"; text: string }
    | { type: "file"; url: string; filename: string; mediaType: string }
  >;
}> {
  const prompt: Array<{
    id: string;
    role: "system" | "user" | "assistant";
    parts: Array<
      | { type: "text"; text: string }
      | { type: "file"; url: string; filename: string; mediaType: string }
    >;
  }> = [];

  // Add system prompt if provided
  if (systemPrompt) {
    prompt.push({
      id: generateMessageId(),
      role: "system",
      parts: [{ type: "text", text: systemPrompt }],
    });
  }

  // Convert messages
  for (const msg of messages) {
    if (msg.role === "system") {
      prompt.push({
        id: generateMessageId(),
        role: "system",
        parts: [{ type: "text", text: msg.content }],
      });
    } else if (msg.role === "user") {
      const parts: Array<
        | { type: "text"; text: string }
        | { type: "file"; url: string; filename: string; mediaType: string }
      > = [{ type: "text", text: msg.content }];

      // Add media files (images and audio) if present
      if (msg.images && msg.images.length > 0) {
        for (const media of msg.images) {
          const dataUri = media.data.startsWith("data:")
            ? media.data
            : `data:${media.mimeType};base64,${media.data}`;

          const filename =
            media.name || (media.type === "audio" ? "audio" : "image");

          parts.push({
            type: "file",
            url: dataUri,
            filename,
            mediaType: media.mimeType,
          });

          console.log(
            `[LLM] Adding ${media.type} to prompt: ${filename} (${media.mimeType})`,
          );
        }
      }

      prompt.push({
        id: generateMessageId(),
        role: "user",
        parts,
      });
    } else if (msg.role === "assistant") {
      prompt.push({
        id: generateMessageId(),
        role: "assistant",
        parts: [{ type: "text", text: msg.content }],
      });
    }
  }

  return prompt;
}

// ============================================================================
// API Calls
// ============================================================================

/**
 * Call Decopilot API (new Mesh endpoint)
 */
async function callDecopilotAPI(
  config: LLMConfig,
  messages: Array<{ id: string; role: string; parts: unknown[] }>,
): Promise<Response> {
  const {
    meshUrl,
    organizationId,
    token,
    modelProviderId,
    modelId = DEFAULT_LANGUAGE_MODEL,
    agentId,
    agentMode = "smart_tool_selection",
  } = config;

  // When running locally with a tunnel, use localhost for internal API calls
  // Only use localhost if meshUrl contains "localhost" (not production tunnels)
  const isLocalTunnel =
    meshUrl.includes("localhost") && meshUrl.includes(".deco.host");
  const effectiveMeshUrl = isLocalTunnel ? "http://localhost:3000" : meshUrl;

  // Use the decopilot endpoint (new Mesh API)
  const url = `${effectiveMeshUrl}/api/${organizationId}/decopilot/stream`;

  console.log(`[LLM] Calling Decopilot API:`, {
    url,
    hasToken: !!token,
    modelId,
    hasAgent: !!agentId,
    messageCount: messages.length,
  });

  const body = {
    messages,
    model: {
      id: modelId,
      connectionId: modelProviderId,
    },
    agent: {
      id: agentId || "",
      mode: agentMode,
    },
    stream: true,
  };

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  try {
    const response = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
        Accept: "application/json, text/event-stream",
      },
      body: JSON.stringify(body),
      signal: controller.signal,
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error("[LLM] API error:", errorText);
      throw new Error(
        `Decopilot API call failed (${response.status}): ${errorText}`,
      );
    }

    return response;
  } finally {
    clearTimeout(timeout);
  }
}

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

// ============================================================================
// Main Functions
// ============================================================================

/**
 * Generate a response using the Mesh API (without streaming callback)
 */
export async function generateResponse(
  env: Env,
  messages: ChatMessage[],
  _options?: {
    discordContext?: DiscordContext;
  },
): Promise<GenerateResponse> {
  // Try to get config from global first
  let config = globalLLMConfig;

  if (!config) {
    // Fallback 1: Try stored config (persistent, doesn't depend on env)
    const { getStoredConfig, getCurrentEnv } = await import("./bot-manager.ts");
    const storedConfig = getStoredConfig();

    if (storedConfig) {
      console.log("[LLM] Using stored config fallback");
      config = {
        meshUrl: storedConfig.meshUrl,
        organizationId: storedConfig.organizationId,
        token: storedConfig.persistentToken,
        modelProviderId: storedConfig.modelProviderId || "",
        modelId: storedConfig.modelId,
        agentId: storedConfig.agentId,
      };
    } else {
      // Fallback 2: Build config from env (may have expired token)
      const storedEnv = getCurrentEnv();
      const effectiveEnv = env.MESH_REQUEST_CONTEXT?.state?.MODEL_PROVIDER
        ?.value
        ? env
        : storedEnv?.MESH_REQUEST_CONTEXT?.state?.MODEL_PROVIDER?.value
          ? storedEnv
          : env;

      const organizationId = effectiveEnv.MESH_REQUEST_CONTEXT?.organizationId;
      if (!organizationId) {
        throw new Error(
          "No organizationId found. Please open Mesh Dashboard and click 'Save' on this MCP to refresh the connection.",
        );
      }

      const meshUrl =
        effectiveEnv.MESH_REQUEST_CONTEXT?.meshUrl ?? effectiveEnv.MESH_URL;
      const token = effectiveEnv.MESH_REQUEST_CONTEXT?.token;
      const state = effectiveEnv.MESH_REQUEST_CONTEXT?.state;
      const connectionId = state?.MODEL_PROVIDER?.value;
      const modelId =
        state?.LANGUAGE_MODEL?.value?.id ?? DEFAULT_LANGUAGE_MODEL;
      const agentId = state?.AGENT?.value;

      if (!connectionId) {
        throw new Error(
          "MODEL_PROVIDER not configured.\n\n" +
            "🔧 **How to fix:**\n" +
            "1. Open **Mesh Dashboard**\n" +
            "2. Go to this MCP's configuration\n" +
            "3. Configure **MODEL_PROVIDER** (e.g., OpenRouter, OpenAI)\n" +
            "4. Click **Save** to apply",
        );
      }

      config = {
        meshUrl,
        organizationId,
        token,
        modelProviderId: connectionId,
        modelId,
        agentId,
      };
    }
  }

  // Convert messages to UIMessage format
  const apiMessages = messagesToPrompt(messages, config.systemPrompt);

  console.log("[LLM] Calling Decopilot API (generate):", {
    messageCount: apiMessages.length,
    hasImages: messages.some((m) => m.images && m.images.length > 0),
  });

  try {
    const response = await callDecopilotAPI(config, apiMessages);

    if (!response.body) {
      throw new Error("No response body from Decopilot API");
    }

    // Parse the streaming response to get full text
    const text = await parseFullStreamResponse(response.body);

    console.log("[LLM] Response received:", {
      textLength: text.length,
    });

    return {
      content: text || "Desculpe, não consegui gerar uma resposta.",
      model: config.modelId || DEFAULT_LANGUAGE_MODEL,
      usedFallback: false,
    };
  } catch (error) {
    console.error("[LLM] Error calling Decopilot API:", error);
    throw error;
  }
}

/**
 * Generate a response with streaming callback for real-time updates
 */
export async function generateResponseWithStreaming(
  messages: ChatMessage[],
  onStream: StreamCallback,
  config?: LLMConfig,
): Promise<string> {
  const effectiveConfig = config ?? globalLLMConfig;

  if (!effectiveConfig) {
    throw new Error("LLM not configured");
  }

  // Convert messages to UIMessage format
  const apiMessages = messagesToPrompt(messages, effectiveConfig.systemPrompt);

  console.log("[LLM Streaming] Calling Decopilot API (stream):", {
    messageCount: apiMessages.length,
    hasImages: messages.some((m) => m.images && m.images.length > 0),
  });

  try {
    const response = await callDecopilotAPI(effectiveConfig, apiMessages);

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

    // Process the stream with callback
    let textContent = "";
    let lastStreamUpdate = 0;
    const STREAM_UPDATE_INTERVAL = 500; // ms

    const reader = response.body
      .pipeThrough(new TextDecoderStream())
      .getReader();
    let buffer = "";
    let eventCount = 0;
    let finished = false;

    while (!finished) {
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

        // Log first few events and important ones
        if (eventCount <= 3 || type === "finish" || type === "tool-call") {
          console.log(`[LLM Streaming] Event ${eventCount}: type=${type}`);
        }

        if (type === "text-delta" && parsed.delta) {
          textContent += parsed.delta;

          const now = Date.now();
          if (now - lastStreamUpdate > STREAM_UPDATE_INTERVAL) {
            await onStream(textContent, false);
            lastStreamUpdate = now;
          }
        } else if (type === "tool-call") {
          // Log tool calls
          console.log(`[LLM Streaming] Tool call:`, parsed);
        } else if (type === "finish") {
          console.log(
            `[LLM Streaming] Finish. Text length: ${textContent.length}`,
          );
          finished = true;
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

/**
 * Parse full stream response (collects all text)
 */
async function parseFullStreamResponse(
  body: ReadableStream<Uint8Array>,
): Promise<string> {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let textContent = "";
  let buffer = "";

  // Track tool calls for logging
  const toolCalls: Array<{
    id: string;
    name: string;
    args: string;
    result?: unknown;
  }> = [];

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
            const { type } = event;

            // Text content (streaming)
            if (type === "text-delta" && event.delta) {
              textContent += event.delta;
            }
            // Text content (complete)
            else if (type === "text" && event.text) {
              textContent += event.text;
            }
            // Tool call started
            else if (
              type === "tool-call" &&
              event.toolCallId &&
              event.toolName
            ) {
              console.log(`🔧 [Stream] Tool call: ${event.toolName}`);
              toolCalls.push({
                id: event.toolCallId,
                name: event.toolName,
                args: event.args ?? "{}",
              });
            }
            // Tool result received
            else if (type === "tool-result" && event.toolCallId) {
              const toolCall = toolCalls.find((t) => t.id === event.toolCallId);
              if (toolCall) {
                toolCall.result = event.result ?? event.output;
                console.log(
                  `✅ [Stream] Tool result for ${toolCall.name}: ${JSON.stringify(toolCall.result).slice(0, 100)}...`,
                );
              }
            }
            // Finish
            else if (type === "finish") {
              console.log(
                `🏁 [Stream] Generation finished. Tools used: ${toolCalls.length}`,
              );
              break;
            }
          } catch {
            // Ignore parse errors
          }
        }
      }
    }
  } finally {
    reader.releaseLock();
  }

  // Log summary if tools were used
  if (toolCalls.length > 0) {
    console.log(`\n📊 [Stream] Summary: ${toolCalls.length} tool(s) called:`);
    for (const tc of toolCalls) {
      console.log(
        `   - ${tc.name}: ${tc.result !== undefined ? "✅ success" : "⏳ pending"}`,
      );
    }
  }

  return textContent;
}

// ============================================================================
// Whisper Integration
// ============================================================================

interface WhisperConfig {
  meshUrl: string;
  organizationId: string;
  token: string;
  whisperConnectionId: string;
}

let whisperConfig: WhisperConfig | null = null;

export function configureWhisper(config: WhisperConfig): void {
  whisperConfig = config;
  console.log("[Whisper] Configured", {
    meshUrl: config.meshUrl,
    organizationId: config.organizationId,
    whisperConnectionId: config.whisperConnectionId,
    hasToken: !!config.token,
  });
}

export function isWhisperConfigured(): boolean {
  return whisperConfig !== null;
}

/**
 * Transcribe audio using Whisper binding
 */
export async function transcribeAudio(
  audioUrl: string,
  _mimeType: string,
  filename: string,
): Promise<string | null> {
  if (!whisperConfig) {
    console.log("[Whisper] Not configured, skipping transcription");
    return null;
  }

  try {
    console.log(`[Whisper] Transcribing audio: ${filename}`);

    // Use localhost for tunnel URLs
    const isTunnel = whisperConfig.meshUrl.includes(".deco.host");
    const effectiveMeshUrl = isTunnel
      ? "http://localhost:3000"
      : whisperConfig.meshUrl;

    // Call Whisper via MCP proxy endpoint
    const url = `${effectiveMeshUrl}/mcp/${whisperConfig.whisperConnectionId}`;

    const response = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${whisperConfig.token}`,
        Accept: "application/json, text/event-stream",
      },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: Date.now(),
        method: "tools/call",
        params: {
          name: "TRANSCRIBE_AUDIO",
          arguments: {
            audioUrl: audioUrl,
            language: undefined, // Auto-detect
            responseFormat: "text",
          },
        },
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error(
        `[Whisper] Transcription failed: ${response.status} ${response.statusText}`,
      );
      console.error(`[Whisper] Error details:`, errorText);
      return null;
    }

    const result = (await response.json()) as {
      result?: {
        content?: Array<{ type: string; text?: string }>;
        text?: string;
      };
    };

    // Try to extract transcription from different response formats
    let transcription: string | undefined;

    // Format 1: MCP content array format
    if (result?.result?.content) {
      transcription = result.result.content.find(
        (c) => c.type === "text",
      )?.text;
    }

    // Format 2: Direct text field
    if (!transcription && result?.result?.text) {
      const textResult = result.result.text;
      if (typeof textResult === "string" && textResult.trim().startsWith("{")) {
        try {
          const parsed = JSON.parse(textResult);
          transcription = parsed.text || textResult;
        } catch {
          transcription = textResult;
        }
      } else {
        transcription = textResult;
      }
    }

    if (transcription) {
      console.log(
        `[Whisper] ✅ Transcription successful (${transcription.length} chars)`,
      );
      return transcription.trim();
    }

    console.warn("[Whisper] No transcription in response:", result);
    return null;
  } catch (error) {
    console.error("[Whisper] Transcription error:", error);
    return null;
  }
}
