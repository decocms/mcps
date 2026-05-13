/**
 * LLM Module - AI Agent Integration for Slack MCP
 *
 * The Slack webhook path lives OUTSIDE the @decocms/runtime request context
 * (no JWT, no per-request bindings resolution), so the AgentOf() binding
 * proxy cannot be picked up from `env.MESH_REQUEST_CONTEXT.state.AGENT`.
 *
 * Instead we construct an agent client by hand, using the persisted
 * `meshApiKey` + `organizationSlug` + `agentId` from Supabase, and call
 * `streamAgent` from @decocms/runtime/decopilot — which is the exact same
 * machinery the binding proxy uses internally (POST to
 * `/api/<org>/decopilot/runtime/stream` with AI SDK UIMessage chunks).
 *
 * This makes the slack-mcp behave identically to a runtime-resolved binding.
 */
import {
  streamAgent,
  type AgentBindingConfig,
  type AgentStreamParams,
  type ResolvedAgentClient,
} from "@decocms/runtime/decopilot";

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
// Agent client
// ============================================================================

/**
 * Build a ResolvedAgentClient for a given connection.
 *
 * Mirrors what the runtime's `createAgentProxy` builds for resolved bindings,
 * but constructed manually because the Slack webhook path has no per-request
 * runtime context. Uses the persisted `meshApiKey` so the call is always
 * authenticated without depending on a session token.
 */
async function getAgentClient(
  connectionId: string,
): Promise<ResolvedAgentClient | null> {
  const config = await getCachedConnectionConfig(connectionId);
  const token = config?.meshApiKey ?? config?.meshToken;
  const orgSlug = config?.organizationSlug ?? config?.organizationId;
  if (!token || !orgSlug || !config?.meshUrl || !config?.agentId) {
    return null;
  }

  const streamUrl = `${config.meshUrl}/api/${orgSlug}/decopilot/runtime/stream`;
  const agentConfig: AgentBindingConfig = {
    __type: "@deco/agent",
    id: config.agentId,
  };

  return {
    STREAM: async (params, opts) => {
      // We deliberately strip `thread_id` from the request: the decopilot
      // endpoint does not auto-create threads — passing an unknown id (the
      // user's name, a temp `<name>-<ts>`, anything not minted by studio)
      // results in 500 "Thread not found". Without a thread_id, the
      // decopilot allocates a fresh thread per call. Slack-side context
      // is already rebuilt every webhook via `buildContextMessages`
      // (channel/thread history → 1 system message), so the agent stays
      // coherent within a conversation without depending on decopilot's
      // own thread memory. Per-person decopilot memory would require us
      // to call a thread-create API and cache the returned id — out of
      // scope here.
      const { thread_id: _ignored, ...rest } = params;
      console.log(`[LLM] streamAgent ${streamUrl} (no thread_id)`);
      return await streamAgent(streamUrl, token, agentConfig, rest, opts);
    },
  };
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
 * Convert SlackChatMessage[] to the UIMessage format expected by
 * @decocms/runtime/decopilot's `streamAgent`.
 */
function toUIMessages(
  messages: SlackChatMessage[],
): AgentStreamParams["messages"] {
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
 * Stream an agent response via the runtime's decopilot streamAgent —
 * the same path the AgentOf() binding would use.
 */
export async function streamAgentResponse(
  connectionId: string,
  messages: SlackChatMessage[],
  threadId?: string,
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
    ...(threadId ? { thread_id: threadId } : {}),
  });
}

/**
 * Collect the final text from a UIMessage stream.
 *
 * `streamAgent` yields a UIMessage that's progressively rebuilt as chunks
 * arrive; each yield carries the cumulative `parts` array. We take the last
 * text part of the last yield, which equals the final assistant message.
 * Tool-call parts are ignored (we don't surface them to Slack).
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
