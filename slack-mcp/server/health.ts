/**
 * Health Check Endpoint
 *
 * Provides system health and monitoring metrics for production environments.
 */

import { getApiKeysCount } from "@decocms/mcps-shared/api-key-manager";
import { getKvStoreSize } from "./lib/kv.ts";
import { getConfigCacheSize } from "./lib/config-cache.ts";

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
    note: "Database uses @deco/postgres binding, configs cached for webhooks",
    actions:
      cacheSize === 0
        ? {
            syncCache:
              "POST /mcp with tools/call SYNC_CONFIG_CACHE to warm-up cache",
          }
        : undefined,
  };
}
