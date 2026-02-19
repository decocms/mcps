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
  agentMode?: "passthrough" | "smart_tool_selection" | "code_execution";
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
    originalMeshUrl: meshUrl,
    isLocalTunnel,
    effectiveMeshUrl,
    url,
    organizationId,
    hasToken: !!token,
    tokenPrefix: token ? token.substring(0, 10) + "..." : "none",
    modelProviderId,
    modelId,
    hasAgent: !!agentId,
    stream,
  });

  // Extract provider from modelId (e.g. "anthropic/claude-sonnet-4.5" → "anthropic")
  const provider = modelId.includes("/") ? modelId.split("/")[0] : "anthropic";

  const body = {
    messages,
    models: {
      connectionId: modelProviderId,
      thinking: {
        id: modelId,
        provider,
      },
    },
    agent: {
      id: agentId || "",
      mode: agentMode,
    },
    stream,
  };

  // Log detalhado do body da requisição (para debug)
  console.log(
    "[LLM] Request body:",
    JSON.stringify(
      {
        ...body,
        messages: body.messages.map((msg: any) => ({
          id: msg.id,
          role: msg.role,
          partsCount: msg.parts?.length || 0,
          partsTypes: msg.parts?.map((p: any) => p.type) || [],
        })),
      },
      null,
      2,
    ),
  );

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

    // Tentar parsear o erro como JSON para ver detalhes de validação
    let parsedError = null;
    try {
      parsedError = JSON.parse(errorText);
    } catch {
      // Se não for JSON, usar o texto direto
    }

    console.error("[LLM] ❌ API ERROR RESPONSE:");
    console.error("Status:", response.status, response.statusText);
    console.error(
      "Headers:",
      JSON.stringify(Object.fromEntries(response.headers.entries()), null, 2),
    );
    console.error("Error body (raw):", errorText);
    if (parsedError) {
      console.error(
        "Error body (parsed):",
        JSON.stringify(parsedError, null, 2),
      );
    }

    // Log o body da requisição que causou o erro
    console.error("\n[LLM] ❌ REQUEST THAT CAUSED ERROR:");
    console.error(JSON.stringify(body, null, 2));

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
 *
 * The Decopilot API expects exactly ONE non-system message,
 * so we consolidate all user/assistant messages into a single user message.
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
  type PartType =
    | { type: "text"; text: string }
    | { type: "file"; url: string; filename: string; mediaType: string };

  const prompt: Array<{
    id: string;
    role: "system" | "user" | "assistant";
    parts: PartType[];
  }> = [];

  // Add system prompt if provided
  if (systemPrompt) {
    prompt.push({
      id: generateMessageId(),
      role: "system",
      parts: [{ type: "text", text: systemPrompt }],
    });
  }

  // Collect system messages separately
  for (const msg of messages) {
    if (msg.role === "system") {
      prompt.push({
        id: generateMessageId(),
        role: "system",
        parts: [{ type: "text", text: msg.content }],
      });
    }
  }

  // Consolidate all non-system messages into a single user message
  // The Decopilot API expects exactly one non-system message
  const consolidatedParts: PartType[] = [];
  const nonSystemMessages = messages.filter((m) => m.role !== "system");

  for (const msg of nonSystemMessages) {
    // Add role prefix for assistant messages to preserve conversation structure
    if (msg.role === "assistant") {
      consolidatedParts.push({
        type: "text",
        text: `[assistant]: ${msg.content}`,
      });
    } else {
      consolidatedParts.push({ type: "text", text: msg.content });
    }

    // Add media files (images and audio) if present
    if (msg.images && msg.images.length > 0) {
      for (const media of msg.images) {
        const dataUri = media.data.startsWith("data:")
          ? media.data
          : `data:${media.mimeType};base64,${media.data}`;

        const filename =
          media.name || (media.type === "audio" ? "audio" : "image");

        consolidatedParts.push({
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
  }

  if (consolidatedParts.length > 0) {
    prompt.push({
      id: generateMessageId(),
      role: "user",
      parts: consolidatedParts,
    });
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

  // Log input messages
  console.log(
    "[LLM] Input messages:",
    JSON.stringify(
      messages.map((m) => ({
        role: m.role,
        contentLength: m.content?.length || 0,
        hasImages: !!m.images?.length,
        imagesCount: m.images?.length || 0,
      })),
      null,
      2,
    ),
  );

  // Convert messages to the format expected by Models API
  const apiMessages = messagesToPrompt(messages, systemPrompt);

  console.log("[LLM] Calling Models API (generate):", {
    messageCount: apiMessages.length,
    config: {
      ...config,
      token: config.token ? `${config.token.substring(0, 10)}...` : "none",
    },
  });

  try {
    const response = await callModelsAPI(config, apiMessages, false);

    console.log("[LLM] Response status:", response.status);
    console.log("[LLM] Response headers:", {
      contentType: response.headers.get("content-type"),
    });

    // The API always returns SSE (text/event-stream), even with stream: false
    // So we need to parse the SSE stream and collect all text
    const responseText = await response.text();

    let fullText = "";
    const lines = responseText.split("\n");

    for (const line of lines) {
      if (line.startsWith("data: ")) {
        try {
          const dataStr = line.substring(6); // Remove "data: " prefix
          const data = JSON.parse(dataStr);

          // Collect text deltas (API uses 'delta' field, not 'text')
          if (data.type === "text-delta" && data.delta) {
            fullText += data.delta;
          }
          // Or collect from parts in final message
          else if (data.parts) {
            for (const part of data.parts) {
              if (part.type === "text" && part.text) {
                fullText += part.text;
              }
            }
          }
        } catch (_e) {
          // Ignore parse errors (e.g., [DONE])
        }
      }
    }

    console.log("[LLM] Response received:", {
      textLength: fullText.length,
    });

    return fullText || "Desculpe, não consegui gerar uma resposta.";
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

  // Log input messages
  console.log(
    "[LLM Streaming] Input messages:",
    JSON.stringify(
      messages.map((m) => ({
        role: m.role,
        contentLength: m.content?.length || 0,
        hasImages: !!m.images?.length,
        imagesCount: m.images?.length || 0,
      })),
      null,
      2,
    ),
  );

  // Convert messages to the format expected by Models API
  const apiMessages = messagesToPrompt(messages, systemPrompt);

  console.log("[LLM Streaming] Calling Models API (stream):", {
    messageCount: apiMessages.length,
    config: {
      ...config,
      token: config.token ? `${config.token.substring(0, 10)}...` : "none",
    },
  });

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
