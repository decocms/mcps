/**
 * LLM Module - AI Agent Integration for Slack MCP
 *
 * Uses the official AgentOf() binding from @decocms/runtime.
 * The agent binding resolves to a client with a STREAM() method
 * that returns an async iterable of UIMessage objects.
 */

import { getInstance } from "./connection-instance.ts";

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
 * Check if the agent binding is available and configured.
 */
export function isAgentAvailable(connectionId: string): boolean {
  return getAgent(connectionId) !== null;
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
 * Returns an async iterable of messages with parts.
 */
export async function streamAgentResponse(
  connectionId: string,
  messages: SlackChatMessage[],
  threadId?: string,
) {
  const agent = getAgent(connectionId);
  if (!agent) {
    throw new Error(
      "Agent not configured.\n\n" +
        "How to fix:\n" +
        "1. Open Mesh Dashboard\n" +
        "2. Go to this MCP's configuration\n" +
        "3. Configure AGENT binding\n" +
        "4. Click Save to apply",
    );
  }

  return agent.STREAM({
    messages: toUIMessages(messages),
    ...(threadId ? { thread_id: threadId } : {}),
  });
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
