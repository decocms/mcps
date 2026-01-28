/**
 * SYNC_CONFIG_CACHE Tool
 *
 * Syncs connection configs from DATABASE binding to local KV cache.
 * Essential for K8s multi-pod deployments where new pods start with empty cache.
 *
 * Use cases:
 * - Pod startup (automatic warm-up)
 * - Health check (manual re-sync)
 * - After DATABASE schema changes
 */

import { z } from "zod";
import type { Env } from "../types/env.ts";
import { runSQL } from "../lib/db-sql.ts";
import { cacheConnectionConfig } from "../lib/config-cache.ts";

export const syncCacheTool = {
  id: "SYNC_CONFIG_CACHE",
  description:
    "Sync all connection configs from DATABASE to local cache. Used for pod warm-up in K8s deployments.",
  inputSchema: z.object({
    force: z
      .boolean()
      .optional()
      .describe("Force re-sync even if cache already has entries"),
  }),
  outputSchema: z.object({
    success: z.boolean(),
    synced: z.number().describe("Number of configs synced to cache"),
    errors: z.array(z.string()).optional(),
  }),
  async execute({
    context,
    runtimeContext,
  }: {
    context: { force?: boolean };
    runtimeContext: { env: unknown };
  }) {
    const { force = false } = context;
    const env = runtimeContext.env as Env;

    console.log(`[SyncCache] 🔄 Starting cache sync (force=${force})...`);

    try {
      // Query all connection configs from DATABASE
      const configs = await runSQL<{
        connection_id: string;
        organization_id: string;
        mesh_url: string;
        mesh_token: string | null;
        model_provider_id: string | null;
        model_id: string | null;
        agent_id: string | null;
        system_prompt: string | null;
        bot_token: string;
        signing_secret: string;
        team_id: string | null;
        bot_user_id: string | null;
        configured_at: string;
        updated_at: string;
      }>(env, "SELECT * FROM slack_connections ORDER BY updated_at DESC", []);

      console.log(`[SyncCache] 📊 Found ${configs.length} configs in DATABASE`);

      // Sync each config to cache
      let synced = 0;
      const errors: string[] = [];

      for (const row of configs) {
        try {
          await cacheConnectionConfig({
            connectionId: row.connection_id,
            organizationId: row.organization_id,
            meshUrl: row.mesh_url,
            meshToken: row.mesh_token || undefined,
            modelProviderId: row.model_provider_id || undefined,
            modelId: row.model_id || undefined,
            agentId: row.agent_id || undefined,
            systemPrompt: row.system_prompt || undefined,
            botToken: row.bot_token,
            signingSecret: row.signing_secret,
            teamId: row.team_id || undefined,
            botUserId: row.bot_user_id || undefined,
            configuredAt: row.configured_at,
            updatedAt: row.updated_at,
          });
          synced++;
        } catch (err) {
          const error = `Failed to cache ${row.connection_id}: ${String(err)}`;
          console.error(`[SyncCache] ❌ ${error}`);
          errors.push(error);
        }
      }

      console.log(
        `[SyncCache] ✅ Cache sync complete: ${synced}/${configs.length} configs synced`,
      );

      return {
        success: errors.length === 0,
        synced,
        errors: errors.length > 0 ? errors : undefined,
      };
    } catch (error) {
      console.error(`[SyncCache] ❌ Fatal error during sync:`, error);
      return {
        success: false,
        synced: 0,
        errors: [String(error)],
      };
    }
  },
};
