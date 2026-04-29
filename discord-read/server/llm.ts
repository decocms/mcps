/**
 * LLM Module - AI Agent Integration for Discord MCP
 *
 * Uses the official AgentOf() binding from @decocms/runtime.
 * The agent binding resolves to a client with a STREAM() method
 * that returns an async iterable of UIMessage objects.
 */

import type { Env } from "./types/env.ts";
import {
  transcribeAudio as sharedTranscribeAudio,
  type WhisperConfig,
} from "@decocms/mcps-shared/mesh-chat";

// ============================================================================
// Types
// ============================================================================

export interface MessageImage {
  type: "image" | "audio";
  data: string; // base64
  mimeType: string;
  name?: string;
}

export interface DiscordChatMessage {
  role: "system" | "user" | "assistant";
  content: string;
  images?: MessageImage[];
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

function getAgent(env: Env): AgentClient | null {
  const agent = (env.MESH_REQUEST_CONTEXT?.state as Record<string, unknown>)
    ?.AGENT;
  if (agent && typeof (agent as AgentClient).STREAM === "function") {
    return agent as AgentClient;
  }
  return null;
}

/**
 * Check if the agent binding is available and configured.
 */
export function isAgentAvailable(env: Env): boolean {
  return getAgent(env) !== null;
}

/**
 * Convert DiscordChatMessage[] to the message format expected by STREAM API.
 */
function toUIMessages(messages: DiscordChatMessage[]) {
  return messages.map((m) => ({
    role: m.role as "system" | "user" | "assistant",
    parts: [
      { type: "text" as const, text: m.content },
      ...(m.images
        ?.filter((img) => img.type === "image")
        .map((img) => ({
          type: "file" as const,
          url: `data:${img.mimeType};base64,${img.data}`,
          filename: img.name ?? "image",
          mediaType: img.mimeType,
        })) ?? []),
    ],
  }));
}

/**
 * Resolve the SELF MCP url for the current org so we can call Mesh's
 * built-in collection tools (COLLECTION_THREADS_CREATE, etc.). Prefer the
 * CONNECTION binding metadata (its `value` is `<orgId>_self`), fall back
 * to constructing it from organizationId.
 */
function getSelfMcpUrl(env: Env): string | null {
  const ctx = env.MESH_REQUEST_CONTEXT;
  const meshUrl = ctx?.meshUrl;
  if (!meshUrl) return null;

  const state = ctx?.state as Record<string, unknown> | undefined;
  const conn = state?.CONNECTION as { value?: string } | undefined;
  const selfConnId =
    conn?.value ?? (ctx?.organizationId ? `${ctx.organizationId}_self` : null);
  if (!selfConnId) return null;

  return `${meshUrl}/mcp/${selfConnId}`;
}

/**
 * Ensure a Mesh agent thread exists with the given id. Mesh's streamCore
 * (in /api/{org}/decopilot/{,runtime/}stream) refuses to run unless the
 * thread already exists — the route loader is expected to create it via
 * COLLECTION_THREADS_CREATE first. The create call is idempotent (Mesh
 * uses INSERT ... ON CONFLICT DO NOTHING on the thread id), so calling it
 * before every STREAM is safe.
 *
 * created_by on the thread is stamped with the userId derived from
 * ctx.auth — when the bot calls this with its mesh_api_key the userId is
 * stable, so the same thread can be reused across all Discord users
 * without hitting "you are not the owner".
 */
async function ensureMeshThread(
  env: Env,
  threadId: string,
  agentId: string,
): Promise<boolean> {
  const url = getSelfMcpUrl(env);
  const token = env.MESH_REQUEST_CONTEXT?.token;
  if (!url || !token) return false;

  try {
    const response = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
        "x-mesh-token": token,
        Accept: "application/json, text/event-stream",
      },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: 1,
        method: "tools/call",
        params: {
          name: "COLLECTION_THREADS_CREATE",
          arguments: { data: { id: threadId, virtual_mcp_id: agentId } },
        },
      }),
    });

    if (!response.ok) {
      const text = await response.text().catch(() => "");
      console.warn(
        `[LLM] ensureMeshThread non-2xx (${response.status}): ${text.slice(0, 300)}`,
      );
      return false;
    }
    return true;
  } catch (err) {
    console.warn(
      "[LLM] ensureMeshThread failed:",
      err instanceof Error ? err.message : String(err),
    );
    return false;
  }
}

/**
 * Direct-HTTP fallback for the agent. Hits /decopilot/stream with a
 * thread_id that we have already ensured exists via ensureMeshThread.
 * Used when the resolved AGENT binding is missing (fresh pod that has
 * not yet received an onChange) or fails at runtime.
 *
 * Reads agent_id, mesh_url, organization_id and a bearer token from the
 * persisted state — the binding metadata `{__type, value}` form is what
 * we keep in `discord_connections.state` (see extractPersistableState
 * upstream in main.ts).
 */
function getDirectHttpAgent(env: Env): AgentClient | null {
  const ctx = env.MESH_REQUEST_CONTEXT;
  const state = ctx?.state as Record<string, unknown> | undefined;
  const agentMeta = state?.AGENT as { id?: string; value?: string } | undefined;
  const agentId = agentMeta?.value ?? agentMeta?.id;
  const meshUrl = ctx?.meshUrl;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const orgPath = (ctx as any)?.organizationSlug || ctx?.organizationId;
  const token = ctx?.token;

  if (!agentId || !meshUrl || !orgPath || !token) {
    return null;
  }

  return {
    STREAM: async (params) => {
      const url = `${meshUrl}/api/${orgPath}/decopilot/stream`;
      console.log(`[LLM] Direct HTTP call to ${url} (agent ${agentId})`);

      const response = await fetch(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-mesh-token": token,
          Authorization: `Bearer ${token}`,
          Accept: "application/json, text/event-stream",
        },
        body: JSON.stringify({
          messages: params.messages,
          agent: { id: agentId },
          stream: true,
          toolApprovalLevel: "auto",
          ...(params.thread_id ? { thread_id: params.thread_id } : {}),
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
        if (!line.startsWith("data: ")) continue;
        const data = line.slice(6).trim();
        if (!data || data === "[DONE]") continue;

        try {
          const event = JSON.parse(data);
          if (event.type === "text-delta" && typeof event.delta === "string") {
            textContent += event.delta;
            yield { parts: [{ type: "text", text: textContent }] };
          } else if (event.type === "text" && typeof event.text === "string") {
            textContent = event.text;
            yield { parts: [{ type: "text", text: textContent }] };
          }
        } catch {
          // ignore unparseable SSE lines
        }
      }
    }
  } finally {
    reader.releaseLock();
  }
}

/**
 * Stream an agent response.
 *
 * Mesh's streamCore requires a pre-existing thread (taskId) — the route
 * loader is expected to create one via COLLECTION_THREADS_CREATE before
 * calling STREAM. We do that here, idempotently, so the bot works on a
 * fresh pod without any manual setup in Mesh UI.
 *
 * Order of operations:
 *  1. Derive a deterministic thread_id (caller-supplied, or one of our
 *     defaults) so subsequent messages from the same Discord user/channel
 *     reuse the same Mesh thread (and conversation memory).
 *  2. Ensure the thread exists in Mesh (idempotent). created_by on the
 *     thread is stamped with the bot's API-key user, which is stable, so
 *     ownership checks pass for every Discord user mapping into it.
 *  3. Try the resolved AGENT binding first (fast, in-process).
 *  4. Fall back to direct HTTP against /decopilot/stream when the binding
 *     is missing or fails — same agent_id, same thread_id.
 */
export async function streamAgentResponse(
  env: Env,
  messages: DiscordChatMessage[],
  threadId?: string,
) {
  const uiMessages = toUIMessages(messages);
  const ctx = env.MESH_REQUEST_CONTEXT;
  const state = ctx?.state as Record<string, unknown> | undefined;
  const agentMeta = state?.AGENT as { id?: string; value?: string } | undefined;
  const agentId = agentMeta?.value ?? agentMeta?.id;

  // Best-effort thread creation. On failure we still try STREAM — Mesh
  // will throw a precise error if the thread really must exist.
  if (threadId && agentId) {
    await ensureMeshThread(env, threadId, agentId);
  }

  const binding = getAgent(env);
  if (binding) {
    try {
      return await binding.STREAM({
        messages: uiMessages,
        ...(threadId ? { thread_id: threadId } : {}),
      });
    } catch (err) {
      console.warn(
        "[LLM] Binding STREAM failed, falling back to direct HTTP:",
        err instanceof Error ? err.message : String(err),
      );
    }
  }

  const direct = getDirectHttpAgent(env);
  if (direct) {
    return direct.STREAM({
      messages: uiMessages,
      ...(threadId ? { thread_id: threadId } : {}),
    });
  }

  throw new Error(
    "Agent not configured.\n\n" +
      "🔧 **How to fix:**\n" +
      "1. Open **Mesh Dashboard**\n" +
      "2. Go to this MCP's configuration\n" +
      "3. Configure **AGENT** binding\n" +
      "4. Click **Save** to apply",
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
    // Each streamed message contains the full accumulated text so far,
    // not a delta. We always take the latest snapshot.
    for (const part of message.parts) {
      if (part.type === "text" && part.text) {
        text = part.text;
      }
    }
  }
  return text;
}

// ============================================================================
// Whisper Integration (per-connection)
// ============================================================================

import { getInstance } from "./bot-instance.ts";

export function configureWhisper(
  connectionId: string,
  config: WhisperConfig,
): void {
  const instance = getInstance(connectionId);
  if (instance) {
    instance.whisperConfig = config;
  }
  console.log("[Whisper] Configured", {
    connectionId,
    meshUrl: config.meshUrl,
    whisperConnectionId: config.whisperConnectionId,
    hasToken: !!config.token,
  });
}

export function isWhisperConfigured(connectionId: string): boolean {
  return getInstance(connectionId)?.whisperConfig != null;
}

export async function transcribeAudio(
  connectionId: string,
  audioUrl: string,
  _mimeType: string,
  filename: string,
): Promise<string | null> {
  const whisperConfig = getInstance(connectionId)?.whisperConfig;
  if (!whisperConfig) {
    console.log("[Whisper] Not configured, skipping transcription");
    return null;
  }

  return sharedTranscribeAudio(whisperConfig, audioUrl, filename);
}
