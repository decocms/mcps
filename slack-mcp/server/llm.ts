/**
 * LLM Module - AI Agent Integration for Slack MCP
 *
 * Resolution order:
 * 1. AgentOf() binding (fast, in-process — but depends on onChange)
 * 2. Direct HTTP to Mesh Decopilot API (reliable, same as health check)
 *
 * The direct HTTP path uses the persisted meshApiKey + organizationSlug
 * from Supabase, bypassing the runtime entirely.
 */

import { getInstance } from "./connection-instance.ts";
import { getCachedConnectionConfig } from "./lib/config-cache.ts";

// ============================================================================
// Types
// ============================================================================

export interface MessageImage {
  type: "image" | "audio";
  data: string; // base64
  mimeType: string;
  name?: string;
}

export interface SlackChatMessage {
  role: "system" | "user" | "assistant";
  content: string;
  images?: MessageImage[];
}

// ============================================================================
// Agent Binding
// ============================================================================

/** Resolved agent client shape after binding resolution */
interface AgentClient {
  STREAM: (params: {
    messages: Array<{
      role: string;
      parts: Array<Record<string, unknown>>;
    }>;
    thread_id?: string;
    toolApprovalLevel?: "auto" | "readonly" | "plan";
  }) => Promise<
    AsyncIterable<{ parts: Array<{ type: string; text?: string }> }>
  >;
}

function getAgent(connectionId: string): AgentClient | null {
  const instance = getInstance(connectionId);
  if (!instance) return null;
  const agent = (
    instance.env.MESH_REQUEST_CONTEXT?.state as Record<string, unknown>
  )?.AGENT;
  if (agent && typeof (agent as AgentClient).STREAM === "function") {
    return agent as AgentClient;
  }
  return null;
}

/**
 * Direct HTTP agent — calls the Mesh Decopilot API directly.
 * Same approach as the /health check: fetch + SSE parsing.
 * Uses persisted meshApiKey (never expires) from Supabase.
 */
async function getDirectHttpAgent(
  connectionId: string,
): Promise<AgentClient | null> {
  const config = await getCachedConnectionConfig(connectionId);
  const token = config?.meshApiKey || config?.meshToken;
  const orgPath = config?.organizationSlug || config?.organizationId;
  if (!token || !orgPath || !config?.meshUrl || !config?.agentId) {
    return null;
  }

  const { meshUrl, agentId } = config;

  return {
    STREAM: async (params) => {
      const url = `${meshUrl}/api/${orgPath}/decopilot/stream`;
      console.log(`[LLM] Direct HTTP call to ${url}`);

      const response = await fetch(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
          Accept: "application/json, text/event-stream",
        },
        body: JSON.stringify({
          messages: params.messages,
          agent: { id: agentId },
          stream: true,
          toolApprovalLevel: params.toolApprovalLevel ?? "auto",
        }),
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(
          `Direct HTTP decopilot call failed (${response.status}): ${errorText}`,
        );
      }

      return sseResponseToAsyncIterable(response);
    },
  };
}

/**
 * Convert an SSE Response into an async iterable of message objects
 * compatible with the AgentClient STREAM interface.
 */
async function* sseResponseToAsyncIterable(
  response: Response,
): AsyncGenerator<{ parts: Array<{ type: string; text?: string }> }> {
  const reader = response.body!.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let textContent = "";

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split("\n");
      buffer = lines.pop() ?? "";

      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed || !trimmed.startsWith("data:")) continue;
        const data = trimmed.slice("data:".length).trim();
        if (!data || data === "[DONE]") continue;

        try {
          const event = JSON.parse(data);
          if (event.type === "text-delta" && event.delta) {
            textContent += event.delta;
          } else if (event.type === "text" && event.text) {
            textContent += event.text;
          } else if (
            event.type === "tool-call" ||
            event.type === "tool-input-start"
          ) {
            textContent = "";
          } else if (event.type === "finish") {
            break;
          }
        } catch {
          // ignore parse errors
        }
      }
    }
  } finally {
    reader.releaseLock();
  }

  yield { parts: [{ type: "text", text: textContent }] };
}

/**
 * Check if the agent binding is available and configured.
 */
export function isAgentAvailable(connectionId: string): boolean {
  return getAgent(connectionId) !== null;
}

/**
 * Check if agent is available (binding or direct HTTP fallback).
 */
export async function isAgentAvailableAsync(
  connectionId: string,
): Promise<boolean> {
  if (getAgent(connectionId)) return true;
  const direct = await getDirectHttpAgent(connectionId);
  return direct !== null;
}

/**
 * Convert SlackChatMessage[] to the message format expected by STREAM API.
 */
function toUIMessages(messages: SlackChatMessage[]) {
  return messages.map((m) => ({
    role: m.role as "system" | "user" | "assistant",
    parts: [
      { type: "text" as const, text: m.content },
      ...(m.images?.map((img) => ({
        type: "file" as const,
        url: `data:${img.mimeType};base64,${img.data}`,
        filename: img.name ?? "image",
        mediaType: img.mimeType,
      })) ?? []),
    ],
  }));
}

/**
 * Stream an agent response.
 *
 * 1. Try AgentOf() binding (fast, in-process)
 *    - If it returns empty text, retry with Direct HTTP
 * 2. Fall back to direct HTTP (same path as health check — always works)
 * 3. If both fail, caller publishes a trigger as last resort
 */
export async function streamAgentResponse(
  connectionId: string,
  messages: SlackChatMessage[],
  threadId?: string,
) {
  const streamParams = {
    messages: toUIMessages(messages),
    toolApprovalLevel: "auto" as const,
    ...(threadId ? { thread_id: threadId } : {}),
  };

  // 1. Try AgentOf() binding
  const bindingAgent = getAgent(connectionId);
  if (bindingAgent) {
    try {
      const stream = await bindingAgent.STREAM(streamParams);
      // Consume the stream and check if it has text
      const text = await collectStreamTextInternal(stream);
      if (text.trim()) {
        // Re-wrap as async iterable with the collected text
        return textToAsyncIterable(text);
      }
      console.log(
        `[LLM] AgentOf() binding returned empty for ${connectionId}, trying direct HTTP`,
      );
    } catch (err) {
      console.log(
        `[LLM] AgentOf() STREAM failed for ${connectionId}: ${err}, trying direct HTTP`,
      );
    }
  }

  // 2. Direct HTTP — same reliable path as /health check
  console.log(`[LLM] Using direct HTTP for ${connectionId}`);
  const directAgent = await getDirectHttpAgent(connectionId);
  if (directAgent) {
    return await directAgent.STREAM(streamParams);
  }

  throw new Error(
    "Agent not configured.\n\n" +
      "How to fix:\n" +
      "1. Open Mesh Dashboard\n" +
      "2. Go to this MCP's configuration\n" +
      "3. Configure AGENT binding\n" +
      "4. Click Save to apply",
  );
}

/**
 * Internal helper to collect text from a stream (same as collectStreamText).
 */
async function collectStreamTextInternal(
  stream: AsyncIterable<{ parts: Array<{ type: string; text?: string }> }>,
): Promise<string> {
  let text = "";
  for await (const message of stream) {
    for (const part of message.parts) {
      if (part.type === "text" && part.text) {
        text = part.text;
      }
    }
  }
  return text;
}

/**
 * Wrap already-collected text back into the async iterable format.
 */
async function* textToAsyncIterable(
  text: string,
): AsyncGenerator<{ parts: Array<{ type: string; text?: string }> }> {
  yield { parts: [{ type: "text", text }] };
}

/**
 * Collect full text from an agent stream.
 * Convenience helper for non-streaming mode.
 */
export async function collectStreamText(
  stream: AsyncIterable<{ parts: Array<{ type: string; text?: string }> }>,
): Promise<string> {
  let text = "";
  for await (const message of stream) {
    for (const part of message.parts) {
      if (part.type === "text" && part.text) {
        text = part.text;
      }
    }
  }
  return text;
}
