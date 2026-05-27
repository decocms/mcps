/**
 * LLM Module - AI Agent Integration for Slack MCP
 *
 * The Slack webhook path runs OUTSIDE @decocms/runtime's request context
 * (no JWT, no per-request binding resolution), so the AgentOf() proxy
 * cannot be picked up from `env.MESH_REQUEST_CONTEXT.state.AGENT`. We
 * also cannot use the runtime's `streamAgent`, which targets
 * `/decopilot/runtime/stream` — that endpoint is the "resume a task"
 * path and requires a pre-existing `taskId`.
 *
 * Instead we call the user-facing chat endpoint `/decopilot/stream`
 * directly, using the persisted `meshApiKey` for auth, and parse the
 * custom SSE stream the endpoint emits (data: { type, text/delta, ... }).
 * We deliberately omit `thread_id`: the endpoint rejects any id that
 * was not minted by studio, and we already rebuild conversation context
 * from Slack history on every webhook (`buildContextMessages` → 1 system
 * message), so the agent stays coherent without depending on
 * decopilot-side thread memory.
 */
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

interface UIMessagePart {
  type: string;
  text?: string;
  url?: string;
  filename?: string;
  mediaType?: string;
}

interface UIMessageLike {
  role: string;
  parts: UIMessagePart[];
}

interface AgentClient {
  STREAM: (params: {
    messages: UIMessageLike[];
    toolApprovalLevel?: "auto" | "readonly" | "plan";
  }) => Promise<
    AsyncIterable<{ parts: Array<{ type: string; text?: string }> }>
  >;
}

// ============================================================================
// Agent client
// ============================================================================

async function getAgentClient(
  connectionId: string,
): Promise<AgentClient | null> {
  const config = await getCachedConnectionConfig(connectionId);
  const token = config?.meshApiKey ?? config?.meshToken;
  const orgSlug = config?.organizationSlug ?? config?.organizationId;
  if (!token || !orgSlug || !config?.meshUrl || !config?.agentId) {
    return null;
  }

  const { meshUrl, agentId } = config;
  const url = `${meshUrl}/api/${orgSlug}/decopilot/stream`;

  return {
    STREAM: async (params) => {
      console.log(`[LLM] POST ${url}`);
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
          `decopilot stream failed (${response.status}): ${errorText}`,
        );
      }

      return sseResponseToAsyncIterable(response);
    },
  };
}

/**
 * Parse the decopilot's custom SSE stream into the same shape the
 * AI SDK `readUIMessageStream` would produce: one yield carrying a
 * `parts: [{ type: "text", text }]` array with the accumulated text.
 * Tool-call events reset the buffer so we never surface them to Slack.
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

// ============================================================================
// Public API
// ============================================================================

/**
 * Sync availability check (no I/O).
 * Kept for API compatibility — the actual config lookup is async, so this
 * always returns true and lets the caller hit the agent and handle failures.
 */
export function isAgentAvailable(_connectionId: string): boolean {
  return true;
}

/**
 * Async availability check — verifies the connection has the credentials
 * needed to build an agent client.
 */
export async function isAgentAvailableAsync(
  connectionId: string,
): Promise<boolean> {
  return (await getAgentClient(connectionId)) !== null;
}

/**
 * Convert SlackChatMessage[] to the UIMessage-like shape the decopilot
 * `/stream` endpoint accepts.
 */
function toUIMessages(messages: SlackChatMessage[]): UIMessageLike[] {
  return messages.map((m) => ({
    role: m.role,
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
 * `threadId` is accepted for caller-side bookkeeping/logs but is NOT sent
 * to the decopilot — see the file-level note on thread_id handling.
 */
export async function streamAgentResponse(
  connectionId: string,
  messages: SlackChatMessage[],
  _threadId?: string,
) {
  const client = await getAgentClient(connectionId);
  if (!client) {
    throw new Error(
      "Agent not configured.\n\n" +
        "How to fix:\n" +
        "1. Open Mesh Dashboard\n" +
        "2. Go to this MCP's configuration\n" +
        "3. Configure the AGENT binding (and save) so we have an agentId\n",
    );
  }

  return client.STREAM({
    messages: toUIMessages(messages),
    toolApprovalLevel: "auto",
  });
}

/**
 * Collect the final text from an agent stream.
 *
 * Each yield carries the cumulative `parts` array; we keep the last text
 * part of the last yield, which equals the final assistant message.
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
