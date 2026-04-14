/**
 * Health Check Endpoint
 *
 * Provides system health, monitoring metrics, and per-connection
 * diagnostics that simulate the full webhook flow.
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
  timestamp: string;
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
// Health Check
// ============================================================================

/**
 * Get health status with per-connection diagnostics.
 *
 * Tests each layer of the webhook flow:
 * 1. config_cache — connection config accessible?
 * 2. slack_api    — bot token valid? (auth.test)
 * 3. triggers     — credentials exist, callback reachable?
 * 4. agent        — binding or fallback available? (stream mode only)
 */
export async function getHealthStatus(): Promise<HealthStatus> {
  const memUsage = process.memoryUsage();
  const cacheSize = getConfigCacheSize();

  const connections = await checkAllConnections();

  const hasError = connections.some((c) => c.overall === "error");
  const hasWarn = connections.some((c) => c.overall === "degraded");

  return {
    status: hasError ? "error" : hasWarn ? "degraded" : "ok",
    timestamp: new Date().toISOString(),
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
      configCacheSize: cacheSize,
    },
    connections,
  };
}

// ============================================================================
// Per-connection diagnostics
// ============================================================================

async function checkAllConnections(): Promise<ConnectionHealth[]> {
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
          detail: `bot=${authResult.user_id}, team=${authResult.team}`,
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

    // Layer 3: Mesh Studio — send a real STREAM message and wait for response
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
          // Read SSE stream to confirm agent responded
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

              // Got text — don't need to read the entire response
              if (gotText) break;
            }
          } finally {
            reader.cancel().catch(() => {});
            reader.releaseLock();
          }

          const preview = responsePreview.trim().slice(0, 80);
          layers.push({
            layer: "mesh_studio",
            status: gotText ? "ok" : "error",
            latencyMs: Date.now() - meshStart,
            detail: gotText
              ? `agent responded (${Date.now() - meshStart}ms): "${preview}"`
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
          callbackDetail = `callback=${resp.status}, types=[${triggerState.activeTriggerTypes.join(",")}]`;
        } catch (fetchErr) {
          callbackDetail = `callback unreachable: ${fetchErr instanceof Error ? fetchErr.message : String(fetchErr)}, types=[${triggerState.activeTriggerTypes.join(",")}]`;
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
            status: "warn",
            latencyMs: Date.now() - agentStart,
            detail: "Using fallback client (meshApiKey/meshToken)",
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
      connectionId: config.connectionId,
      teamName: config.teamName,
      connectionName: config.connectionName,
      mode,
      overall,
      layers,
    });
  }

  return results;
}
