/**
 * Registry Sync Tool
 *
 * Public tool to manually trigger synchronization of MCP apps
 * from the official registry to the local database.
 */

import { createTool } from "@decocms/runtime/tools";
import { z } from "zod";
import type { Env } from "../main.ts";
import { syncFromRegistry } from "../lib/sync.ts";
import { getSyncStats, isDatabaseAvailable } from "../lib/postgres.ts";

/**
 * Input schema for REGISTRY_SYNC tool
 */
const SyncInputSchema = z.object({
  maxApps: z
    .number()
    .int()
    .min(1)
    .max(10000)
    .optional()
    .describe(
      "Maximum number of apps to sync (optional, defaults to all available)",
    ),
  onlyWithRemotes: z
    .boolean()
    .optional()
    .default(true)
    .describe(
      "Only sync apps that have remote endpoints (default: true for better quality)",
    ),
});

/**
 * Output schema for REGISTRY_SYNC tool
 */
const SyncOutputSchema = z.object({
  success: z.boolean().describe("Whether the sync completed successfully"),
  synced: z.number().describe("Number of apps synced successfully"),
  skipped: z.number().describe("Number of apps skipped (filtered/blacklisted)"),
  errors: z.number().describe("Number of errors during sync"),
  durationMs: z.number().describe("Total sync duration in milliseconds"),
  stats: z
    .object({
      totalApps: z.number().describe("Total apps in database after sync"),
      withRemotes: z.number().describe("Apps with remote endpoints"),
      withPackages: z.number().describe("Apps with packages"),
      latestVersions: z.number().describe("Latest version entries"),
      lastSyncAt: z.string().nullable().describe("Last sync timestamp"),
    })
    .describe("Current database statistics"),
  errorMessages: z
    .array(z.string())
    .optional()
    .describe("Error messages if any (only first 10)"),
});

/**
 * REGISTRY_SYNC - Synchronizes MCP apps from the official registry
 */
export const createSyncTool = (env: Env) =>
  createTool({
    id: "REGISTRY_SYNC",
    description:
      "Synchronizes MCP servers from the official registry to the local database. " +
      "This populates the indexed database with apps that can be searched and filtered efficiently. " +
      "By default, only syncs apps with remote endpoints for better quality listings.",
    inputSchema: SyncInputSchema,
    outputSchema: SyncOutputSchema,
    execute: async ({ context }: { context: unknown }) => {
      const { maxApps, onlyWithRemotes = true } = (context ?? {}) as z.infer<
        typeof SyncInputSchema
      >;

      // Check if DATABASE is available
      if (!isDatabaseAvailable(env)) {
        throw new Error(
          "DATABASE binding not available. Please ensure the MCP is installed with the @deco/postgres binding configured.",
        );
      }

      try {
        // Run the sync
        const result = await syncFromRegistry(env, {
          maxApps,
          onlyWithRemotes,
        });

        // Get current stats
        const stats = await getSyncStats(env);

        return {
          success: result.errors === 0,
          synced: result.synced,
          skipped: result.skipped,
          errors: result.errors,
          durationMs: result.durationMs,
          stats,
          errorMessages:
            result.errorMessages.length > 0
              ? result.errorMessages.slice(0, 10)
              : undefined,
        };
      } catch (error) {
        throw new Error(
          `Sync failed: ${error instanceof Error ? error.message : String(error)}`,
        );
      }
    },
  });
