/**
 * LLM Integration for Slack MCP
 *
 * Uses direct Mesh API calls to LLM providers.
 * This is used in webhook context where bindings are not available.
 */

const DEFAULT_LANGUAGE_MODEL = "anthropic/claude-sonnet-4";

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
  type: "image" | "audio";
  data: string; // base64
  mimeType: string;
  name?: string;
}

export interface Message {
  role: "user" | "assistant" | "system";
  content: string;
  images?: MessageImage[];
}

/**
 * Call LLM via Mesh Models API (same as mcp-studio)
 */
async function callModelsAPI(
  config: LLMConfig,
  messages: Array<{ role: string; parts: any }>,
  stream: boolean = false,
): Promise<Response> {
  const {
    meshUrl,
    organizationId,
    token,
    modelProviderId,
    modelId = DEFAULT_LANGUAGE_MODEL,
    agentId,
  } = config;

  // When running locally with a tunnel, use localhost for internal API calls
  const isTunnel = meshUrl.includes(".deco.host");
  const effectiveMeshUrl = isTunnel ? "http://localhost:3000" : meshUrl;

  // Use the decopilot endpoint (new Mesh API)
  const url = `${effectiveMeshUrl}/api/${organizationId}/decopilot/stream`;

  console.log(`[LLM] Calling Decopilot API:`, {
    url,
    hasToken: !!token,
    modelId,
    hasAgent: !!agentId,
    stream,
  });

  const body = {
    messages,
    model: {
      id: modelId,
      connectionId: modelProviderId,
    },
    agent: {
      id: agentId ?? null,
    },
    stream: true,
  };

  const response = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    const errorText = await response.text();
    console.error("[LLM] API error:", errorText);
    throw new Error(
      `Mesh Models API call failed (${response.status}): ${errorText}`,
    );
  }

  return response;
}

/**
 * Generate unique message ID
 */
function generateMessageId(): string {
  return `msg_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
}

/**
 * Convert messages to Decopilot API format
 * Format: { id, role, parts: [...] }
 */
function messagesToPrompt(
  messages: Message[],
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
        
        const filename = media.name || 
          (media.type === "audio" ? "audio" : "image");
        
        parts.push({
          type: "file",
          url: dataUri,
          filename,
          mediaType: media.mimeType,
        });
        
        console.log(`[LLM] Adding ${media.type} to prompt: ${filename} (${media.mimeType})`);
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

/**
 * Generate a response from the LLM via Mesh Models API
 */
export async function generateLLMResponse(
  messages: Message[],
  config: LLMConfig,
): Promise<string> {
  const { systemPrompt } = config;

  // Convert messages to the format expected by Models API
  const apiMessages = messagesToPrompt(messages, systemPrompt);

  console.log("[LLM] Calling Models API (generate):", {
    messageCount: apiMessages.length,
  });

  try {
    const response = await callModelsAPI(config, apiMessages, false);
    const result = (await response.json()) as {
      parts?: Array<{ type: string; text?: string }>;
      finishReason?: string;
    };

    // Extract text from parts
    let text = "";
    if (result.parts) {
      for (const part of result.parts) {
        if (part.type === "text" && part.text) {
          text += part.text;
        }
      }
    }

    console.log("[LLM] Response received:", {
      textLength: text.length,
      finishReason: result.finishReason,
    });

    return text || "Desculpe, não consegui gerar uma resposta.";
  } catch (error) {
    console.error("[LLM] Error calling Models API:", error);
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
 * Generate a response from the LLM via Mesh Models API with streaming
 */
export async function generateLLMResponseWithStreaming(
  messages: Message[],
  config: LLMConfig,
  onStream: StreamCallback,
): Promise<string> {
  const { systemPrompt } = config;

  // Convert messages to the format expected by Models API
  const apiMessages = messagesToPrompt(messages, systemPrompt);

  console.log("[LLM Streaming] Calling Models API (stream)");

  try {
    const response = await callModelsAPI(config, apiMessages, true);

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
