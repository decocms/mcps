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
      credentialId: "aik_tWm2aK8twh6ST3B86jvmA",
      thinking: {
        provider: resolveProvider(modelId),
      },
    },
    agent: {
      id: agentId ?? "",
    },
    stream: true,
    toolApprovalLevel: "yolo" as const,
  };

  console.log(`[MeshChat] ========== callDecopilotAPI ==========`);
  console.log(`[MeshChat] URL: ${url}`);
  console.log(`[MeshChat] Model: ${modelId}, Provider: ${resolveProvider(modelId)}, Connection: ${modelProviderId ?? "none"}`);
  console.log(`[MeshChat] Agent: id=${agentId ?? "none"}, mode=${agentMode}`);
  console.log(`[MeshChat] Messages: ${messages.length}, timeout: ${timeoutMs}ms`);
  console.log(`[MeshChat] Effective mesh URL: ${effectiveMeshUrl} (original: ${meshUrl})`);
  messages.forEach((m, i) => {
    const partsDesc = m.parts.map(p => p.type === "text" ? `text(${(p as any).text?.length ?? 0})` : `file(${(p as any).filename ?? "?"})`).join(", ");
    console.log(`[MeshChat]   Message[${i}]: role=${m.role}, parts=[${partsDesc}]`);
  });

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  const fetchStartTime = Date.now();
  try {
    console.log(`[MeshChat] Sending request to Decopilot API...`);
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

    console.log(`[MeshChat] Decopilot API response: status=${response.status}, ok=${response.ok}, time=${Date.now() - fetchStartTime}ms`);
    console.log(`[MeshChat] Response headers: content-type=${response.headers.get("content-type")}`);

    if (!response.ok) {
      const errorText = await response.text();
      console.error(`[MeshChat] Decopilot API FAILED: status=${response.status}, body=${errorText.substring(0, 500)}`);
      throw new Error(
        `Decopilot API call failed (${response.status}): ${errorText}`,
      );
    }

    return response;
  } finally {
    clearTimeout(timeout);
  }
}
