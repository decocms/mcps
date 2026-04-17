import { getApiKeysCount } from "@decocms/mcps-shared/api-key-manager";
import { getKvStoreSize } from "./lib/kv.ts";
import { getConfigCacheSize } from "./lib/config-cache.ts";

export function getHealthStatus() {
  const memUsage = process.memoryUsage();

  return {
    status: "ok",
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    memory: {
      heapUsed: memUsage.heapUsed,
      heapTotal: memUsage.heapTotal,
      rss: memUsage.rss,
    },
    metrics: {
      apiKeysCount: getApiKeysCount(),
      kvStoreSize: getKvStoreSize(),
      configCacheSize: getConfigCacheSize(),
    },
  };
}
