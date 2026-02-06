/**
 * SYNC_CONFIG_CACHE Tool
 *
 * Returns cache status information.
 * Note: With KV-only storage, there's nothing to sync.
 * Configs are saved directly to KV on onChange and persist to disk.
 */

import { z } from "zod";
import { getConfigCacheSize } from "../lib/config-cache.ts";

export const syncCacheTool = {
  id: "SYNC_CONFIG_CACHE",
  description:
    "Get cache status. Note: With KV-only storage, configs are automatically persisted to disk.",
  inputSchema: z.object({
    force: z
      .boolean()
      .optional()
      .describe("Ignored - kept for backwards compatibility"),
  }),
  outputSchema: z.object({
    success: z.boolean(),
    synced: z.number().describe("Number of configs in cache"),
    message: z.string().describe("Status message"),
  }),
  async execute() {
    const cacheSize = getConfigCacheSize();

    console.log(
      `[SyncCache] 📊 Cache status: ${cacheSize} configs in KV store`,
    );

    return {
      success: true,
      synced: cacheSize,
      message:
        "Using KV-only storage. Configs are automatically persisted to disk on save.",
    };
  },
};
