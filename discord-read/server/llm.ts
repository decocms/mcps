/**
 * LLM Module - AI Model Integration
 *
 * Based on mcp-studio/server/llm.ts
 * Calls the Mesh API to generate AI responses using configured model and agent.
 * Includes fallback to direct LLM call when Agent is not configured or times out.
 */

import type { Env } from "./types/env.ts";

const DEFAULT_LANGUAGE_MODEL = "anthropic/claude-sonnet-4-20250514";
const REQUEST_TIMEOUT_MS = 60000; // 60 seconds

export interface ChatMessage {
  role: "system" | "user" | "assistant";
  content: string;
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

/**
 * Generate a response using the Mesh API
 * Falls back to direct LLM call if Agent is not configured or request fails
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
  console.log(
    `║  Agent/Gateway: ${(agentId || "NOT SET - using fallback")?.slice(0, 30).padEnd(30)}        ║`,
  );
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

  // Convert messages to Mesh format
  const meshMessages = messages.map((msg) => ({
    role: msg.role,
    parts: [{ type: "text", text: msg.content }],
  }));

  // If Agent is configured, try with Agent first
  if (agentId) {
    console.log(`\n🤖 [LLM] Sending message to AGENT: ${agentId}`);
    console.log(`   Model: ${modelId}`);
    console.log(`   Messages: ${meshMessages.length} message(s)\n`);

    try {
      const result = await callWithAgent(
        meshUrl,
        organizationId,
        token,
        connectionId,
        modelId,
        agentId,
        meshMessages,
      );
      console.log(`✅ [LLM] Agent response received successfully`);
      return { content: result, model: modelId, usedFallback: false };
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      console.log(`❌ [LLM] Agent call failed: ${errorMsg}`);
      console.log(`🔄 [LLM] Falling back to direct LLM call...`);

      // Fall through to direct LLM call
    }
  } else {
    console.log(`\n⚠️ [LLM] No Agent configured`);
  }

  // Fallback: Direct LLM call without Agent
  console.log(`\n💬 [LLM] Sending message directly to LLM (no Agent/tools)`);
  console.log(`   Model: ${modelId}`);
  console.log(`   Messages: ${meshMessages.length} message(s)\n`);

  const result = await callDirectLLM(
    meshUrl,
    organizationId,
    token,
    connectionId,
    modelId,
    meshMessages,
  );

  console.log(`✅ [LLM] Direct LLM response received successfully`);
  return { content: result, model: modelId, usedFallback: true };
}

/**
 * Call Mesh API with Agent/Gateway
 */
async function callWithAgent(
  meshUrl: string,
  organizationId: string,
  token: string,
  connectionId: string,
  modelId: string,
  agentId: string,
  messages: Array<{
    role: string;
    parts: Array<{ type: string; text: string }>;
  }>,
): Promise<string> {
  const requestBody = {
    model: {
      connectionId,
      id: modelId,
    },
    gateway: {
      id: agentId,
    },
    messages,
  };

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  try {
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
        signal: controller.signal,
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

    return await parseStreamResponse(response.body);
  } finally {
    clearTimeout(timeout);
  }
}

/**
 * Direct LLM call without Agent (fallback)
 */
async function callDirectLLM(
  meshUrl: string,
  organizationId: string,
  token: string,
  connectionId: string,
  modelId: string,
  messages: Array<{
    role: string;
    parts: Array<{ type: string; text: string }>;
  }>,
): Promise<string> {
  const requestBody = {
    model: {
      connectionId,
      id: modelId,
    },
    // No gateway - direct LLM call
    messages,
  };

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  try {
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
        signal: controller.signal,
      },
    );

    if (!response.ok) {
      const errorText = await response.text().catch(() => "");
      throw new Error(
        `Direct LLM error (${response.status}): ${errorText || response.statusText}`,
      );
    }

    if (!response.body) {
      throw new Error("No response body from Direct LLM");
    }

    return await parseStreamResponse(response.body);
  } finally {
    clearTimeout(timeout);
  }
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
