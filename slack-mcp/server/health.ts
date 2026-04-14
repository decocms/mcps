/**
 * Health Check Endpoint
 *
 * Provides system health and monitoring metrics for production environments.
 * Includes a deep health check that simulates the full webhook flow.
 */

import { getApiKeysCount } from "@decocms/mcps-shared/api-key-manager";
import { getKvStoreSize } from "./lib/kv.ts";
import {
  getConfigCacheSize,
  getCachedConnectionConfig,
} from "./lib/config-cache.ts";
import { loadAllConnectionConfigs } from "./lib/supabase-client.ts";
import { isAgentAvailable, isAgentAvailableAsync } from "./llm.ts";

interface HealthStatus {
  status: "ok" | "degraded" | "error";
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
  note: string;
  actions?: {
    syncCache?: string;
  };
}

/**
 * Get current health status
 */
export async function getHealthStatus(): Promise<HealthStatus> {
  const memUsage = process.memoryUsage();
  const cacheSize = getConfigCacheSize();

  return {
    status: "ok",
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
    note: "Database uses @deco/postgres binding,  configs cached for webhooks",
    actions:
      cacheSize === 0
        ? {
            syncCache:
              "POST /mcp with tools/call SYNC_CONFIG_CACHE to warm-up cache",
          }
        : undefined,
  };
}

// ============================================================================
// Deep Health Check — simulates the full webhook flow per connection
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

export interface DeepHealthResult {
  status: "ok" | "degraded" | "error";
  timestamp: string;
  uptimeSeconds: number;
  connections: ConnectionHealth[];
}

/**
 * Run deep health check — tests every layer of the webhook flow:
 *
 * 1. supabase     — can we load configs from Supabase?
 * 2. config_cache — does getCachedConnectionConfig return data?
 * 3. slack_api    — does the bot token work? (auth.test)
 * 4. triggers     — do trigger credentials exist in Supabase?
 * 5. agent        — is the agent binding or fallback available? (only if NOT trigger_only)
 */
export async function getDeepHealthStatus(): Promise<DeepHealthResult> {
  const connections: ConnectionHealth[] = [];
  let globalStatus: "ok" | "degraded" | "error" = "ok";

  // Layer 1: Supabase — load all connections
  let allConfigs: Awaited<ReturnType<typeof loadAllConnectionConfigs>> = [];
  try {
    allConfigs = await loadAllConnectionConfigs();
  } catch (err) {
    return {
      status: "error",
      timestamp: new Date().toISOString(),
      uptimeSeconds: Math.floor(process.uptime()),
      connections: [
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
      ],
    };
  }

  if (allConfigs.length === 0) {
    return {
      status: "error",
      timestamp: new Date().toISOString(),
      uptimeSeconds: Math.floor(process.uptime()),
      connections: [
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
      ],
    };
  }

  // Check each connection
  for (const config of allConfigs) {
    const layers: LayerCheck[] = [];
    const mode = config.responseConfig?.triggerOnly ? "trigger_only" : "stream";

    // Layer 2: Config cache — can the webhook router find this connection?
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

    // Layer 3: Slack API — bot token valid?
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

    // Layer 4: Triggers — credentials exist?
    const triggerStart = Date.now();
    try {
      const { loadTriggerCredentials } = await import(
        "./lib/supabase-client.ts"
      );
      const triggerState = await loadTriggerCredentials(config.connectionId);
      if (triggerState) {
        // Try a HEAD request to the callback URL to verify it's reachable
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

    // Layer 5: Agent — available? (only relevant if NOT trigger_only)
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
            detail:
              "Using fallback client (binding not available, using meshApiKey/meshToken)",
          });
        } else {
          layers.push({
            layer: "agent",
            status: "error",
            latencyMs: Date.now() - agentStart,
            detail:
              "No agent available — binding missing and no fallback credentials",
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

    // Determine overall status for this connection
    const hasError = layers.some((l) => l.status === "error");
    const hasWarn = layers.some((l) => l.status === "warn");
    const overall = hasError ? "error" : hasWarn ? "degraded" : "ok";

    if (overall === "error") globalStatus = "error";
    else if (overall === "degraded" && globalStatus === "ok")
      globalStatus = "degraded";

    connections.push({
      connectionId: config.connectionId,
      teamName: config.teamName,
      connectionName: config.connectionName,
      mode,
      overall,
      layers,
    });
  }

  return {
    status: globalStatus,
    timestamp: new Date().toISOString(),
    uptimeSeconds: Math.floor(process.uptime()),
    connections,
  };
}
