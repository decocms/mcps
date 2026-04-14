/**
 * LLM Module - AI Agent Integration for Slack MCP
 *
 * Uses the official AgentOf() binding from @decocms/runtime.
 * The agent binding resolves to a client with a STREAM() method
 * that returns an async iterable of UIMessage objects.
 *
 * Fallback: when AgentOf() is not available (e.g. pod restart before
 * onChange fires), creates a standalone decopilot client using
 * persisted meshToken + organizationSlug from Supabase.
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
 * Create a fallback agent client using persisted config from Supabase.
 * Used when AgentOf() binding is not available (pod restart, stale token).
 */
async function getFallbackAgent(
  connectionId: string,
): Promise<AgentClient | null> {
  const config = await getCachedConnectionConfig(connectionId);
  // Prefer persistent API key over session token
  const token = config?.meshApiKey || config?.meshToken;
  if (
    !token ||
    !config?.organizationSlug ||
    !config?.meshUrl ||
    !config?.agentId
  ) {
    return null;
  }

  const { createDecopilotClient } = await import("@decocms/runtime/decopilot");
  const client = createDecopilotClient({
    baseUrl: `${config.meshUrl}/api`,
    orgSlug: config.organizationSlug,
    token,
  });

  const agentId = config.agentId;

  return {
    STREAM: async (params) => {
      return client.stream({
        ...(params as any),
        agent: { id: agentId },
        toolApprovalLevel: params.toolApprovalLevel,
      });
    },
  };
}

/**
 * Direct HTTP fallback when createDecopilotClient fails due to missing
 * organization context in the runtime. Calls the Mesh Decopilot API
 * directly and converts the SSE response into the AgentClient async iterable.
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
 * Check if agent is available (binding or fallback).
 */
export async function isAgentAvailableAsync(
  connectionId: string,
): Promise<boolean> {
  if (getAgent(connectionId)) return true;
  const fallback = await getFallbackAgent(connectionId);
  return fallback !== null;
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
 * Stream an agent response using the AgentOf() STREAM binding.
 * Falls back to standalone decopilot client if binding is not available.
 * Returns an async iterable of messages with parts.
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

  // Try AgentOf() binding first
  const bindingAgent = getAgent(connectionId);
  if (bindingAgent) {
    try {
      return await bindingAgent.STREAM(streamParams);
    } catch (err) {
      console.log(
        `[LLM] AgentOf() STREAM failed for ${connectionId}: ${err}, trying fallback`,
      );
    }
  }

  // Fallback: standalone decopilot client with persisted credentials
  console.log(`[LLM] Using fallback client for ${connectionId}`);
  const fallback = await getFallbackAgent(connectionId);
  if (fallback) {
    try {
      return await fallback.STREAM(streamParams);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.log(
        `[LLM] Fallback client failed for ${connectionId}: ${msg}, trying direct HTTP`,
      );

      // Workaround: runtime's createDecopilotClient may fail with
      // "Organization context is required" — bypass it with a direct HTTP call
      if (msg.includes("Organization context is required")) {
        const directAgent = await getDirectHttpAgent(connectionId);
        if (directAgent) {
          return await directAgent.STREAM(streamParams);
        }
      }

      throw err;
    }
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
