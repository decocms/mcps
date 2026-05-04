import { createPrivateTool } from "@decocms/runtime/tools";
import { z } from "zod";
import type { Env } from "../../types/env.ts";
import {
  setDiscordConfig,
  type DiscordConfig,
} from "../../lib/config-cache.ts";
import { isSupabaseConfigured } from "../../lib/supabase.ts";

export const createSaveConfigTool = (_env: Env) =>
  createPrivateTool({
    id: "DISCORD_SAVE_CONFIG",
    description:
      "Save Discord bot configuration (bot token, public key, application ID, authorized guilds). The bot will auto-start once configured. Token is persisted in Supabase and survives pod restarts.",
    annotations: { destructiveHint: false },
    inputSchema: z
      .object({
        botToken: z
          .string()
          .describe("Discord bot token from the Discord Developer Portal."),
        discordApplicationId: z
          .string()
          .optional()
          .describe(
            "Discord Application ID. Required for the agent to respond to interactions (button/select/modal events).",
          ),
        discordPublicKey: z
          .string()
          .optional()
          .describe(
            "Discord application public key. Only needed if you plan to use HTTP webhook delivery for slash commands (gateway delivery does not need it).",
          ),
        authorizedGuilds: z
          .array(z.string())
          .optional()
          .describe(
            "Guild IDs allowed to use this bot. Empty array (or omitted) = all guilds.",
          ),
        meshApiKey: z
          .string()
          .optional()
          .describe(
            "Persistent Mesh API key (never expires). Recommended over the auto-rotated session token.",
          ),
      })
      .strict(),
    outputSchema: z
      .object({
        success: z.boolean(),
        message: z.string(),
        connectionId: z.string(),
      })
      .strict(),
    execute: async (params: any) => {
      const env = params.runtimeContext?.env;
      const ctx = params.context as {
        botToken: string;
        discordApplicationId?: string;
        discordPublicKey?: string;
        authorizedGuilds?: string[];
        meshApiKey?: string;
      };

      if (!isSupabaseConfigured()) {
        return {
          success: false,
          message:
            "Supabase not configured. Set SUPABASE_URL and SUPABASE_ANON_KEY environment variables.",
          connectionId: "",
        };
      }

      const connectionId =
        env?.MESH_REQUEST_CONTEXT?.connectionId || "default-connection";
      const organizationId =
        env?.MESH_REQUEST_CONTEXT?.organizationId || "default-org";
      const meshUrl = env?.MESH_REQUEST_CONTEXT?.meshUrl || "";

      const config: DiscordConfig = {
        connectionId,
        organizationId,
        meshUrl,
        meshApiKey: ctx.meshApiKey,
        botToken: ctx.botToken,
        discordApplicationId: ctx.discordApplicationId,
        discordPublicKey: ctx.discordPublicKey,
        authorizedGuilds: ctx.authorizedGuilds || [],
      };

      try {
        await setDiscordConfig(config);

        // Try to start the bot now; failure is non-fatal (auto-restart cron retries).
        try {
          const { ensureBotRunning } = await import("../../bot/manager.ts");
          if (env) await ensureBotRunning(env);
        } catch {
          // ignore
        }

        return {
          success: true,
          message:
            ctx.authorizedGuilds && ctx.authorizedGuilds.length > 0
              ? `Discord bot configured for ${ctx.authorizedGuilds.length} authorized guild(s).`
              : "Discord bot configured (allowed in all guilds).",
          connectionId,
        };
      } catch (err) {
        return {
          success: false,
          message: `Failed to save configuration: ${err instanceof Error ? err.message : String(err)}`,
          connectionId,
        };
      }
    },
  });
