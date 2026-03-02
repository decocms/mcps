import type { DecopilotMessage, MeshChatConfig } from "./types.ts";

const DEFAULT_TIMEOUT_MS = 120_000;

const PROVIDER_ALIASES: Record<string, string> = {
  "x-ai": "xai",
};

/**
 * Resolve the effective mesh URL.
 * When running locally with a .deco.host tunnel, uses http://localhost:3000
 * for server-to-server communication.
 */
export function resolveUrl(meshUrl: string): string {
  const isLocalTunnel =
    meshUrl.includes("localhost") && meshUrl.includes(".deco.host");
  const isTunnel = !isLocalTunnel && meshUrl.includes(".deco.host");

  if (isLocalTunnel || isTunnel) {
    return "http://localhost:3000";
  }

  return meshUrl;
}

/**
 * Derive the provider identifier from a model ID.
 * Handles provider aliases (e.g., "x-ai" -> "xai").
 */
export function resolveProvider(modelId: string): string {
  const rawProvider = modelId.includes("/")
    ? modelId.split("/")[0]
    : "anthropic";
  return PROVIDER_ALIASES[rawProvider] ?? rawProvider;
}

/**
 * Call the Mesh Decopilot streaming API.
 * Always returns a streaming SSE response.
 */
export async function callDecopilotAPI(
  config: MeshChatConfig,
  messages: DecopilotMessage[],
): Promise<Response> {
  const {
    meshUrl,
    organizationId,
    token,
    modelProviderId,
    modelId = "anthropic/claude-sonnet-4",
    agentId,
    agentMode = "smart_tool_selection",
    timeoutMs = DEFAULT_TIMEOUT_MS,
  } = config;

  const effectiveMeshUrl = resolveUrl(meshUrl);
  const url = `${effectiveMeshUrl}/api/${organizationId}/decopilot/stream`;

  const body = {
    messages,
    models: {
      connectionId: modelProviderId,
      thinking: {
        id: modelId,
        provider: resolveProvider(modelId),
      },
    },
    agent: {
      id: agentId ?? "",
      mode: agentMode,
    },
    stream: true,
    toolApprovalLevel: "yolo" as const,
  };

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
        Accept: "application/json, text/event-stream",
      },
      body: JSON.stringify(body),
      signal: controller.signal,
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(
        `Decopilot API call failed (${response.status}): ${errorText}`,
      );
    }

    return response;
  } finally {
    clearTimeout(timeout);
  }
}
