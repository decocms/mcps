import { createPrivateTool } from "@decocms/runtime/tools";
import { z } from "zod";
import type { Env } from "../../types/env.ts";
import { deleteDiscordConfig } from "../../lib/config-cache.ts";
import { isSupabaseConfigured } from "../../lib/supabase.ts";

export const createDeleteConfigTool = (_env: Env) =>
  createPrivateTool({
    id: "DISCORD_DELETE_CONFIG",
    description:
      "Delete the Discord bot configuration for this connection. Stops the bot and removes the saved token from Supabase. Cannot be undone.",
    annotations: { destructiveHint: true },
    inputSchema: z.object({}).strict(),
    outputSchema: z
      .object({
        success: z.boolean(),
        message: z.string(),
      })
      .strict(),
    execute: async (params: any) => {
      const env = params.runtimeContext?.env;

      if (!isSupabaseConfigured()) {
        return {
          success: false,
          message: "Supabase not configured.",
        };
      }

      const connectionId =
        env?.MESH_REQUEST_CONTEXT?.connectionId || "default-connection";

      try {
        try {
          const { shutdownBot } = await import("../../bot/manager.ts");
          if (env) await shutdownBot(env);
        } catch {
          // bot may not have been running; proceed with config delete
        }

        await deleteDiscordConfig(connectionId);

        return {
          success: true,
          message: `Configuration deleted for ${connectionId}.`,
        };
      } catch (err) {
        return {
          success: false,
          message: `Failed to delete configuration: ${err instanceof Error ? err.message : String(err)}`,
        };
      }
    },
  });
