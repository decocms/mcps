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

    // Layer 3: Mesh Studio — API reachable?
    const meshStart = Date.now();
    try {
      const token = config.meshApiKey || config.meshToken;
      if (!config.meshUrl || !token) {
        layers.push({
          layer: "mesh_studio",
          status: "error",
          latencyMs: 0,
          detail: !config.meshUrl
            ? "No meshUrl configured"
            : "No meshApiKey or meshToken",
        });
      } else {
        const orgPath = config.organizationSlug || config.organizationId;
        const pingUrl = `${config.meshUrl}/api/${orgPath}/decopilot/health`;
        const resp = await fetch(pingUrl, {
          method: "GET",
          headers: {
            Authorization: `Bearer ${token}`,
            Accept: "application/json",
          },
          signal: AbortSignal.timeout(5000),
        });
        if (resp.ok) {
          layers.push({
            layer: "mesh_studio",
            status: "ok",
            latencyMs: Date.now() - meshStart,
            detail: `${pingUrl} → ${resp.status}`,
          });
        } else {
          // Even non-200 means the server is up, just check if it's a 5xx
          const is5xx = resp.status >= 500;
          layers.push({
            layer: "mesh_studio",
            status: is5xx ? "error" : "ok",
            latencyMs: Date.now() - meshStart,
            detail: `${pingUrl} → ${resp.status}`,
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
