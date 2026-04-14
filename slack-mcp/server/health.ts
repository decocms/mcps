/**
 * Health Check Endpoint
 *
 * /health is called by PagerDuty every minute.
 *
 * - On minutes divisible by 10 (xx:00, xx:10, xx:20, …) it runs the full
 *   deep check: Supabase, config cache, Slack API, Mesh Studio STREAM,
 *   triggers, and agent availability. The result is cached in memory.
 *
 * - On the other 9 calls it returns lightweight system metrics plus the
 *   cached deep-check result (if any). Zero external calls.
 */

import { getApiKeysCount } from "@decocms/mcps-shared/api-key-manager";
import { getKvStoreSize } from "./lib/kv.ts";
import {
  getConfigCacheSize,
  getCachedConnectionConfig,
} from "./lib/config-cache.ts";
import {
  loadAllConnectionConfigs,
  loadTriggerCredentials,
} from "./lib/supabase-client.ts";
import { isAgentAvailable, isAgentAvailableAsync } from "./llm.ts";

// ============================================================================
// Types
// ============================================================================

type LayerStatus = "ok" | "error" | "warn" | "skip";

interface LayerCheck {
  layer: string;
  status: LayerStatus;
  latencyMs: number;
  detail?: string;
}

interface ConnectionHealth {
  connectionId: string;
  teamName?: string;
  connectionName?: string;
  mode: "trigger_only" | "stream" | "unknown";
  overall: "ok" | "degraded" | "error";
  layers: LayerCheck[];
}

interface HealthStatus {
  status: "ok" | "degraded" | "error";
  summary: string;
  timestamp: string;
  deepCheckAt?: string;
  uptime: number;
  memory: {
    heapUsed: number;
    heapTotal: number;
    external: number;
    rss: number;
  };
  metrics: {
    apiKeysCount: number;
    kvStoreSize: number;
    configCacheSize: number;
  };
  connections: ConnectionHealth[];
}

// ============================================================================
// Deep-check cache
// ============================================================================

let cachedDeepResult: {
  status: "ok" | "degraded" | "error";
  timestamp: string;
  connections: ConnectionHealth[];
} | null = null;

// ============================================================================
// Summary builder — one-line description for PagerDuty alerts
// ============================================================================

function buildSummary(
  status: "ok" | "degraded" | "error",
  connections: ConnectionHealth[],
): string {
  if (status === "ok") {
    return `All ${connections.length} connection(s) healthy`;
  }

  const failing = connections.filter(
    (c) => c.overall === "error" || c.overall === "degraded",
  );

  const parts: string[] = [];
  for (const conn of failing) {
    const name = conn.connectionName || conn.teamName || conn.connectionId;
    const brokenLayers = conn.layers
      .filter((l) => l.status === "error" || l.status === "warn")
      .map((l) => `${l.layer}: ${l.detail?.slice(0, 80) ?? l.status}`)
      .join("; ");
    parts.push(`[${name}] ${brokenLayers}`);
  }

  return `${failing.length}/${connections.length} connection(s) ${status}: ${parts.join(" | ")}`;
}

// ============================================================================
// Public API
// ============================================================================

export async function getHealthStatus(): Promise<HealthStatus> {
  const now = new Date();
  const minute = now.getMinutes();
  const isDeepMinute = minute % 10 === 0;

  // Run deep check on multiples of 10, or if we never ran one
  if (isDeepMinute || !cachedDeepResult) {
    const connections = await runDeepCheck();
    const hasError = connections.some((c) => c.overall === "error");
    const hasWarn = connections.some((c) => c.overall === "degraded");

    cachedDeepResult = {
      status: hasError ? "error" : hasWarn ? "degraded" : "ok",
      timestamp: now.toISOString(),
      connections,
    };
  }

  const memUsage = process.memoryUsage();

  return {
    status: cachedDeepResult.status,
    summary: buildSummary(cachedDeepResult.status, cachedDeepResult.connections),
    timestamp: now.toISOString(),
    deepCheckAt: cachedDeepResult.timestamp,
    uptime: process.uptime(),
    memory: {
      heapUsed: memUsage.heapUsed,
      heapTotal: memUsage.heapTotal,
      external: memUsage.external,
      rss: memUsage.rss,
    },
    metrics: {
      apiKeysCount: getApiKeysCount(),
      kvStoreSize: getKvStoreSize(),
      configCacheSize: getConfigCacheSize(),
    },
    connections: cachedDeepResult.connections,
  };
}

// ============================================================================
// Deep check — runs all layers
// ============================================================================

async function runDeepCheck(): Promise<ConnectionHealth[]> {
  let allConfigs: Awaited<ReturnType<typeof loadAllConnectionConfigs>>;
  try {
    allConfigs = await loadAllConnectionConfigs();
  } catch (err) {
    return [
      {
        connectionId: "_global",
        mode: "unknown",
        overall: "error",
        layers: [
          {
            layer: "supabase",
            status: "error",
            latencyMs: 0,
            detail: `Failed to load connections: ${err instanceof Error ? err.message : String(err)}`,
          },
        ],
      },
    ];
  }

  if (allConfigs.length === 0) {
    return [
      {
        connectionId: "_global",
        mode: "unknown",
        overall: "error",
        layers: [
          {
            layer: "supabase",
            status: "error",
            latencyMs: 0,
            detail: "No connections found in Supabase",
          },
        ],
      },
    ];
  }

  const results: ConnectionHealth[] = [];

  for (const config of allConfigs) {
    const layers: LayerCheck[] = [];
    const mode = config.responseConfig?.triggerOnly ? "trigger_only" : "stream";

    // Layer 1: Config cache
    const cacheStart = Date.now();
    try {
      const cached = await getCachedConnectionConfig(config.connectionId);
      layers.push({
        layer: "config_cache",
        status: cached ? "ok" : "error",
        latencyMs: Date.now() - cacheStart,
        detail: cached
          ? `triggerOnly=${cached.responseConfig?.triggerOnly ?? false}`
          : "Config not found in cache",
      });
    } catch (err) {
      layers.push({
        layer: "config_cache",
        status: "error",
        latencyMs: Date.now() - cacheStart,
        detail: err instanceof Error ? err.message : String(err),
      });
    }

    // Layer 2: Slack API
    const slackStart = Date.now();
    try {
      if (!config.botToken) {
        layers.push({
          layer: "slack_api",
          status: "error",
          latencyMs: 0,
          detail: "No bot token configured",
        });
      } else {
        const { WebClient } = await import("@slack/web-api");
        const tempClient = new WebClient(config.botToken);
        const authResult = await tempClient.auth.test();
        layers.push({
          layer: "slack_api",
          status: "ok",
          latencyMs: Date.now() - slackStart,
          detail: "authenticated",
        });
      }
    } catch (err) {
      layers.push({
        layer: "slack_api",
        status: "error",
        latencyMs: Date.now() - slackStart,
        detail: err instanceof Error ? err.message : String(err),
      });
    }

    // Layer 3: Mesh Studio — real STREAM to the agent
    const meshStart = Date.now();
    try {
      const token = config.meshApiKey || config.meshToken;
      const orgPath = config.organizationSlug || config.organizationId;
      if (!config.meshUrl || !token || !orgPath || !config.agentId) {
        layers.push({
          layer: "mesh_studio",
          status: "error",
          latencyMs: 0,
          detail: [
            !config.meshUrl && "no meshUrl",
            !token && "no token",
            !orgPath && "no org",
            !config.agentId && "no agentId",
          ]
            .filter(Boolean)
            .join(", "),
        });
      } else {
        const streamUrl = `${config.meshUrl}/api/${orgPath}/decopilot/stream`;
        const resp = await fetch(streamUrl, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
            Accept: "application/json, text/event-stream",
          },
          body: JSON.stringify({
            messages: [
              {
                role: "user",
                parts: [
                  {
                    type: "text",
                    text: "health check: responda apenas 'ok'",
                  },
                ],
              },
            ],
            agent: { id: config.agentId },
            stream: true,
            toolApprovalLevel: "auto",
          }),
          signal: AbortSignal.timeout(30000),
        });

        if (!resp.ok) {
          const errorText = await resp.text().catch(() => "");
          layers.push({
            layer: "mesh_studio",
            status: "error",
            latencyMs: Date.now() - meshStart,
            detail: `STREAM ${resp.status}: ${errorText.slice(0, 200)}`,
          });
        } else {
          const reader = resp.body!.getReader();
          const decoder = new TextDecoder();
          let gotText = false;
          let responsePreview = "";

          try {
            let buffer = "";
            while (true) {
              const { done, value } = await reader.read();
              if (done) break;
              buffer += decoder.decode(value, { stream: true });
              const lines = buffer.split("\n");
              buffer = lines.pop() ?? "";

              for (const line of lines) {
                const trimmed = line.trim();
                if (!trimmed.startsWith("data:")) continue;
                const data = trimmed.slice(5).trim();
                if (!data || data === "[DONE]") continue;
                try {
                  const event = JSON.parse(data);
                  if (
                    (event.type === "text-delta" && event.delta) ||
                    (event.type === "text" && event.text)
                  ) {
                    gotText = true;
                    responsePreview += event.delta || event.text || "";
                  }
                } catch {
                  // ignore parse errors
                }
              }

              if (gotText) break;
            }
          } finally {
            reader.cancel().catch(() => {});
            reader.releaseLock();
          }

          layers.push({
            layer: "mesh_studio",
            status: gotText ? "ok" : "error",
            latencyMs: Date.now() - meshStart,
            detail: gotText
              ? `agent responded (${Date.now() - meshStart}ms)`
              : "STREAM connected but agent returned no text",
          });
        }
      }
    } catch (err) {
      layers.push({
        layer: "mesh_studio",
        status: "error",
        latencyMs: Date.now() - meshStart,
        detail: err instanceof Error ? err.message : String(err),
      });
    }

    // Layer 4: Triggers
    const triggerStart = Date.now();
    try {
      const triggerState = await loadTriggerCredentials(config.connectionId);
      if (triggerState) {
        let callbackReachable = false;
        let callbackDetail = "";
        try {
          const resp = await fetch(triggerState.credentials.callbackUrl, {
            method: "HEAD",
            headers: {
              Authorization: `Bearer ${triggerState.credentials.callbackToken}`,
            },
            signal: AbortSignal.timeout(5000),
          });
          callbackReachable = resp.status < 500;
          callbackDetail = `callback=${resp.status}, triggers=${triggerState.activeTriggerTypes.length}`;
        } catch (fetchErr) {
          callbackDetail = `callback unreachable, triggers=${triggerState.activeTriggerTypes.length}`;
        }

        layers.push({
          layer: "triggers",
          status: callbackReachable ? "ok" : "warn",
          latencyMs: Date.now() - triggerStart,
          detail: callbackDetail,
        });
      } else {
        layers.push({
          layer: "triggers",
          status: mode === "trigger_only" ? "error" : "warn",
          latencyMs: Date.now() - triggerStart,
          detail: "No trigger credentials found",
        });
      }
    } catch (err) {
      layers.push({
        layer: "triggers",
        status: "error",
        latencyMs: Date.now() - triggerStart,
        detail: err instanceof Error ? err.message : String(err),
      });
    }

    // Layer 5: Agent (only if NOT trigger_only)
    if (mode === "stream") {
      const agentStart = Date.now();
      try {
        const bindingAvailable = isAgentAvailable(config.connectionId);
        const fallbackAvailable = bindingAvailable
          ? true
          : await isAgentAvailableAsync(config.connectionId);

        if (bindingAvailable) {
          layers.push({
            layer: "agent",
            status: "ok",
            latencyMs: Date.now() - agentStart,
            detail: "AgentOf() binding active",
          });
        } else if (fallbackAvailable) {
          layers.push({
            layer: "agent",
            status: "ok",
            latencyMs: Date.now() - agentStart,
            detail: "fallback client active (direct HTTP)",
          });
        } else {
          layers.push({
            layer: "agent",
            status: "error",
            latencyMs: Date.now() - agentStart,
            detail:
              "No agent available — no binding and no fallback credentials",
          });
        }
      } catch (err) {
        layers.push({
          layer: "agent",
          status: "error",
          latencyMs: Date.now() - agentStart,
          detail: err instanceof Error ? err.message : String(err),
        });
      }
    } else {
      layers.push({
        layer: "agent",
        status: "skip",
        latencyMs: 0,
        detail: "Skipped — trigger_only mode",
      });
    }

    const hasError = layers.some((l) => l.status === "error");
    const hasWarn = layers.some((l) => l.status === "warn");
    const overall = hasError ? "error" : hasWarn ? "degraded" : "ok";

    results.push({
      connectionId: config.connectionId.slice(0, 8) + "…",
      teamName: config.teamName ? config.teamName.slice(0, 1) + "***" : undefined,
      connectionName: config.connectionName,
      mode,
      overall,
      layers,
    });
  }

  return results;
}
