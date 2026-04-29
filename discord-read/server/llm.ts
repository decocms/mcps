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
  const providerMeta = state?.MODEL_PROVIDER as
    | { id?: string; value?: string }
    | undefined;
  const modelMeta = state?.LANGUAGE_MODEL as
    | { id?: string; value?: string }
    | undefined;
  const connectionId = ctx?.connectionId;
  const instance = connectionId ? getInstance(connectionId) : undefined;
  // After Mesh fires onChange, state.* bindings are Proxies that only
  // expose their methods. Fall back to the values we stashed on the
  // instance during onChange / bootstrap.
  // Only accept string values from state metadata. After Mesh resolves
  // bindings, `state.LANGUAGE_MODEL` (and similar) becomes an MCP client
  // where `.value` is a *function*, not the underlying connection id —
  // so naive truthy checks would feed the function source string into
  // the request body and Mesh would reject the request with
  // "expected string, received undefined" once JSON.stringify drops it.
  const asStr = (v: unknown): string | undefined =>
    typeof v === "string" && v.length > 0 ? v : undefined;
  const agentId =
    asStr(agentMeta?.value) ||
    asStr(agentMeta?.id) ||
    instance?.agentId ||
    undefined;
  const credentialId =
    asStr(providerMeta?.value) ||
    asStr(providerMeta?.id) ||
    instance?.modelProviderId ||
    undefined;
  // openai/gpt-4o is the safe default: OpenRouter routes it to OpenAI
  // (or compatible providers) that accept the OpenAI-style tool_choice
  // payload Mesh sends. anthropic/claude-sonnet-4 fails here with
  // "No endpoints found that support the provided 'tool_choice' value"
  // because OpenRouter routes it to Anthropic which uses a different
  // tool_choice schema than what Mesh emits.
  const DEFAULT_MODEL_ID = "openai/gpt-4o";
  const modelId =
    asStr(modelMeta?.value) ||
    asStr(modelMeta?.id) ||
    instance?.modelId ||
    (credentialId ? DEFAULT_MODEL_ID : undefined);
  const meshUrl = ctx?.meshUrl;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const orgPath = (ctx as any)?.organizationSlug || ctx?.organizationId;
  const token = ctx?.token;

  if (!agentId || !meshUrl || !orgPath || !token) {
    console.warn(
      `[LLM] getDirectHttpAgent returning null. agentId=${!!agentId} meshUrl=${!!meshUrl} orgPath=${!!orgPath} token=${!!token} stateKeys=${state ? Object.keys(state).join(",") : "none"} agentMetaKeys=${agentMeta ? Object.keys(agentMeta).join(",") : "none"}`,
    );
    return null;
  }

  return {
    STREAM: async (params) => {
      const url = `${meshUrl}/api/${orgPath}/decopilot/stream`;
      // Include explicit models when we have both credentialId and a
      // model id — without them Mesh's resolveDefaultModels picks the
      // first AI provider key + first model in the org, which on this
      // org is a free-tier OpenRouter model that returns empty for
      // tool-using agents. With both fields the request locks the
      // model to whatever the operator configured in Mesh state.
      const includeModels = !!credentialId && !!modelId;
      console.log(
        `[LLM] Direct HTTP call to ${url} (agent=${agentId} credentialId=${credentialId ?? "null"} modelId=${modelId ?? "null"} includeModels=${includeModels})`,
      );

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
          ...(includeModels
            ? {
                models: {
                  credentialId,
                  thinking: { id: modelId, title: modelId },
                },
              }
            : {}),
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
  let rawLineCount = 0;
  let dataLineCount = 0;
  const eventTypeCounts: Record<string, number> = {};

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split("\n");
      buffer = lines.pop() ?? "";

      for (const line of lines) {
        rawLineCount++;
        // Verbose diagnostic so we can see exactly what Mesh's SSE
        // emits. Cap each line at 300 chars so a giant tool result
        // does not flood the log.
        if (line.length > 0) {
          console.log(`[LLM SSE] ${line.slice(0, 300)}`);
        }
        if (!line.startsWith("data: ")) continue;
        dataLineCount++;
        const data = line.slice(6).trim();
        if (!data || data === "[DONE]") continue;

        try {
          const event = JSON.parse(data);
          const t = typeof event.type === "string" ? event.type : "(no type)";
          eventTypeCounts[t] = (eventTypeCounts[t] ?? 0) + 1;
          if (event.type === "text-delta" && typeof event.delta === "string") {
            textContent += event.delta;
            yield { parts: [{ type: "text", text: textContent }] };
          } else if (event.type === "text" && typeof event.text === "string") {
            textContent = event.text;
            yield { parts: [{ type: "text", text: textContent }] };
          } else if (event.type === "error") {
            // Mesh streams agent-side errors as `error` events instead of
            // failing the HTTP response. Surface these so the catch path
            // in streamAgentResponse can render the real cause to chat.
            const msg =
              typeof event.errorText === "string"
                ? event.errorText
                : typeof event.error === "string"
                  ? event.error
                  : typeof event.message === "string"
                    ? event.message
                    : JSON.stringify(event);
            throw new Error(`Mesh SSE error event: ${msg}`);
          }
        } catch (err) {
          // Re-throw real errors (e.g. agent failures captured above).
          // Swallow only JSON.parse failures on partial SSE lines.
          if (
            err instanceof Error &&
            err.message.startsWith("Mesh SSE error")
          ) {
            throw err;
          }
        }
      }
    }
  } finally {
    reader.releaseLock();
    console.log(
      `[LLM SSE] done. rawLines=${rawLineCount} dataLines=${dataLineCount} eventTypes=${JSON.stringify(eventTypeCounts)} textLen=${textContent.length}`,
    );
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
  const connectionId = ctx?.connectionId;
  const instance = connectionId ? getInstance(connectionId) : undefined;
  const agentId = agentMeta?.value ?? agentMeta?.id ?? instance?.agentId;

  console.log(
    `[LLM] streamAgentResponse: connectionId=${connectionId} agentMetaKeys=${agentMeta ? Object.keys(agentMeta).join(",") : "none"} agentMetaValue=${agentMeta?.value ?? "undefined"} instanceAgentId=${instance?.agentId ?? "undefined"} resolvedAgentId=${agentId ?? "null"} threadId=${threadId ?? "null"}`,
  );

  const binding = getAgent(env);
  const direct = getDirectHttpAgent(env);

  // Run a single attempt with a given thread_id. We isolate this so the
  // outer try/catch can retry with a fresh thread_id when Mesh refuses
  // the run because another pod claimed it (rolling deploys, brief
  // multi-pod windows, etc.).
  const attemptStream = async (currentThreadId: string | undefined) => {
    if (currentThreadId && agentId) {
      await ensureMeshThread(env, currentThreadId, agentId);
    }
    if (direct) {
      console.log(
        `[LLM] streamAgentResponse: trying direct HTTP first (thread_id=${currentThreadId ?? "none"})`,
      );
      return await direct.STREAM({
        messages: uiMessages,
        ...(currentThreadId ? { thread_id: currentThreadId } : {}),
      });
    }
    if (binding) {
      console.log(
        `[LLM] streamAgentResponse: trying binding STREAM (thread_id=${currentThreadId ?? "none"})`,
      );
      return await binding.STREAM({
        messages: uiMessages,
        ...(currentThreadId ? { thread_id: currentThreadId } : {}),
      });
    }
    return null;
  };

  // Detect the runtime errors that mean "this thread is busy on another
  // pod" so we know to retry with a fresh, never-used thread id.
  const isClaimConflict = (err: unknown) => {
    const msg = err instanceof Error ? err.message : String(err);
    return (
      msg.includes("already running on another pod") ||
      msg.includes("Failed to claim run")
    );
  };

  if (binding || direct) {
    try {
      const stream = await attemptStream(threadId);
      if (stream) return stream;
    } catch (err) {
      if (!isClaimConflict(err)) {
        // Real failure — surface it via the outer fallback chain so the
        // catch in messageHandler renders a useful message.
        console.warn(
          "[LLM] STREAM failed (non-claim):",
          err instanceof Error ? err.message : String(err),
        );
      } else {
        // Mesh's runRegistry is holding the thread for another pod (rolling
        // deploy, stale lock). Retry once with a thread id we are certain
        // has never been claimed before — this loses the agent's persistent
        // memory for this turn but unblocks the user.
        const retryThreadId = `${threadId ?? "discord-bot"}-${Date.now()}-${Math.random()
          .toString(36)
          .slice(2, 8)}`;
        console.warn(
          `[LLM] Run claim conflict; retrying with fresh thread_id=${retryThreadId}`,
        );
        try {
          const retryStream = await attemptStream(retryThreadId);
          if (retryStream) return retryStream;
        } catch (retryErr) {
          console.warn(
            "[LLM] Retry STREAM also failed:",
            retryErr instanceof Error ? retryErr.message : String(retryErr),
          );
        }
      }
    }
  }

  // Both binding and direct HTTP returned null. Build a precise message
  // so the operator (with DEBUG_ERRORS_TO_CHAT on) sees exactly which
  // input is missing instead of the generic "Agent not configured".
  const diag = {
    binding: !!binding,
    agentId: agentId ?? null,
    meshUrl: !!ctx?.meshUrl,
    orgPath:
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      !!((ctx as any)?.organizationSlug || ctx?.organizationId),
    token: !!ctx?.token,
    stateKeys: state ? Object.keys(state) : [],
  };
  throw new Error(`Agent not configured. Debug: ${JSON.stringify(diag)}`);
}

/**
 * Collect full text from an agent stream.
 * Convenience helper for non-streaming mode.
 */
export async function collectStreamText(
  stream: AsyncIterable<{ parts: Array<{ type: string; text?: string }> }>,
): Promise<string> {
  let text = "";
  let messageCount = 0;
  const partTypeCounts: Record<string, number> = {};

  for await (const message of stream) {
    messageCount++;
    for (const part of message.parts) {
      partTypeCounts[part.type] = (partTypeCounts[part.type] ?? 0) + 1;
      // Vercel AI SDK can emit text in several part shapes depending on
      // version: `text`, `text-delta`, `reasoning`, `step-text`. Capture
      // anything that looks textual so the agent's final answer survives
      // even when it lands on a non-canonical part type.
      const candidate =
        part.type === "text" || part.type === "reasoning"
          ? part.text
          : (part as Record<string, unknown>).text;
      if (typeof candidate === "string" && candidate.length > 0) {
        text = candidate;
      }
    }
  }

  console.log(
    `[LLM] stream consumed: messages=${messageCount} parts=${JSON.stringify(partTypeCounts)} textLen=${text.length}`,
  );

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
