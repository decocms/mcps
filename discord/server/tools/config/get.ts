import { createPrivateTool } from "@decocms/runtime/tools";
import { z } from "zod";
import type { Env } from "../../types/env.ts";
import { getDiscordConfig } from "../../lib/config-cache.ts";
import { isSupabaseConfigured } from "../../lib/supabase.ts";

function maskToken(token: string | null | undefined): string {
  if (!token) return "MISSING";
  if (token.length < 16) return "***";
  return `${token.slice(0, 10)}...${token.slice(-4)}`;
}

export const createGetConfigTool = (_env: Env) =>
  createPrivateTool({
    id: "DISCORD_GET_CONFIG",
    description:
      "Read the saved Discord bot configuration for this connection. Bot token is redacted to first10+last4 characters; never returned in full.",
    annotations: { readOnlyHint: true },
    inputSchema: z.object({}).strict(),
    outputSchema: z
      .object({
        success: z.boolean(),
        message: z.string(),
        config: z
          .object({
            connectionId: z.string(),
            organizationId: z.string(),
            botTokenMasked: z.string(),
            discordApplicationId: z.string().optional(),
            discordPublicKey: z.string().optional(),
            authorizedGuilds: z.array(z.string()).optional(),
            configuredAt: z.string().optional(),
            updatedAt: z.string().optional(),
          })
          .optional(),
      })
      .strict(),
    execute: async (params: any) => {
      const env = params.runtimeContext?.env;

      if (!isSupabaseConfigured()) {
        return {
          success: false,
          message:
            "Supabase not configured. Set SUPABASE_URL and SUPABASE_ANON_KEY environment variables.",
        };
      }

      const connectionId =
        env?.MESH_REQUEST_CONTEXT?.connectionId || "default-connection";

      try {
        const config = await getDiscordConfig(connectionId);
        if (!config) {
          return {
            success: false,
            message: `No configuration found for connection ${connectionId}. Use DISCORD_SAVE_CONFIG first.`,
          };
        }

        return {
          success: true,
          message: "Configuration loaded.",
          config: {
            connectionId: config.connectionId,
            organizationId: config.organizationId,
            botTokenMasked: maskToken(config.botToken),
            discordApplicationId: config.discordApplicationId,
            discordPublicKey: config.discordPublicKey,
            authorizedGuilds: config.authorizedGuilds,
            configuredAt: config.configuredAt,
            updatedAt: config.updatedAt,
          },
        };
      } catch (err) {
        return {
          success: false,
          message: `Failed to load configuration: ${err instanceof Error ? err.message : String(err)}`,
        };
      }
    },
  });
