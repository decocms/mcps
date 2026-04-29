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
 * Direct-HTTP fallback for the agent. Hits the older /decopilot/stream
 * endpoint instead of /decopilot/runtime/stream — the older one does not
 * require a pre-existing Mesh thread/taskId, so it works on bootstrap
 * BEFORE Mesh has fired onChange to inject the resolved AGENT proxy.
 *
 * Reads agent_id, mesh_url, organization_id and a bearer token from the
 * persisted state — the binding metadata `{__type, value}` form is what we
 * keep in `discord_connections.state` (see extractPersistableState upstream).
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

      // Mesh's streamCore requires a taskId. Both /runtime/stream and the
      // older /decopilot/stream endpoints reject calls without one, and the
      // public SDK never sets it. Generate a fresh UUID per call as an
      // empirical attempt — if Mesh accepts arbitrary task IDs we proceed,
      // if not we will see a clearer error than "taskId is required".
      const taskId =
        typeof crypto !== "undefined" && "randomUUID" in crypto
          ? crypto.randomUUID()
          : `discord-${Date.now()}-${Math.random().toString(36).slice(2)}`;

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
          task_id: taskId,
          taskId: taskId,
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
 * Stream an agent response. Tries the resolved AGENT binding first (fast,
 * uses the runtime stream endpoint), falls back to direct HTTP against the
 * older /decopilot/stream endpoint when the binding is missing or fails —
 * which is the case on a fresh pod that has not yet received an onChange.
 */
export async function streamAgentResponse(
  env: Env,
  messages: DiscordChatMessage[],
  threadId?: string,
) {
  const uiMessages = toUIMessages(messages);

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
    return direct.STREAM({ messages: uiMessages });
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
