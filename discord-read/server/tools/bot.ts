/**
 * Bot Control Tools
 *
 * Tools for stopping and checking bot status.
 * Bots auto-start from Supabase bootstrap and onChange — no manual start needed.
 * All operations are scoped to the calling connection (multi-tenant).
 */

import { createPrivateTool } from "@decocms/runtime/tools";
import { z } from "zod";
import type { Env } from "../types/env.ts";
import { isBotRunning, shutdownBot } from "../bot-manager.ts";
import { getDiscordClient } from "../discord/client.ts";

/**
 * Stop the Discord bot
 */
export const createStopBotTool = (env: Env) =>
  createPrivateTool({
    id: "DISCORD_BOT_STOP",
    description: "Stop the Discord bot and disconnect from Discord Gateway.",
    annotations: { destructiveHint: true },
    inputSchema: z.object({}).strict(),
    outputSchema: z
      .object({
        success: z.boolean(),
        message: z.string(),
      })
      .strict(),
    execute: async (params: any) => {
      const currentEnv = params.runtimeContext?.env || env;

      console.log("[Tool] DISCORD_BOT_STOP called");

      try {
        await shutdownBot(currentEnv);

        return {
          success: true,
          message: "Discord bot stopped successfully",
        };
      } catch (error) {
        return {
          success: false,
          message: `Failed to stop bot: ${error instanceof Error ? error.message : "Unknown error"}`,
        };
      }
    },
  });

/**
 * Get bot status
 */
export const createBotStatusTool = (env: Env) =>
  createPrivateTool({
    id: "DISCORD_BOT_STATUS",
    description:
      "Get the current status of the Discord bot (running, stopped, guilds, etc.)",
    annotations: { readOnlyHint: true },
    inputSchema: z.object({}).strict(),
    outputSchema: z
      .object({
        running: z.boolean(),
        botTag: z.string().optional(),
        guilds: z.number().optional(),
        uptime: z.number().optional(),
        message: z.string(),
      })
      .strict(),
    execute: async (params: any) => {
      console.log(
        `[Tool] DISCORD_BOT_STATUS params keys: ${Object.keys(params).join(", ")}`,
      );
      console.log(
        `[Tool] runtimeContext exists: ${!!params.runtimeContext}, runtimeContext.env exists: ${!!params.runtimeContext?.env}`,
      );
      console.log(
        `[Tool] runtimeContext.env connectionId: ${params.runtimeContext?.env?.MESH_REQUEST_CONTEXT?.connectionId}`,
      );
      console.log(
        `[Tool] closure env connectionId: ${env.MESH_REQUEST_CONTEXT?.connectionId}`,
      );
      const currentEnv = params.runtimeContext?.env || env;

      console.log("[Tool] DISCORD_BOT_STATUS called");

      const connectionId =
        currentEnv.MESH_REQUEST_CONTEXT?.connectionId || "default-connection";
      const running = isBotRunning(currentEnv);
      const client = getDiscordClient(connectionId);

      if (!running || !client) {
        return {
          running: false,
          message:
            "Discord bot is not running. It will auto-start on next config save or restart cycle.",
        };
      }

      const botTag = client.user?.tag || "Unknown";
      const guilds = client.guilds.cache.size;
      const uptime = client.uptime || 0;

      return {
        running: true,
        botTag,
        guilds,
        uptime,
        message: `Bot is running as ${botTag}, connected to ${guilds} guild(s)`,
      };
    },
  });

// Export all bot control tools
export const botTools = [createStopBotTool, createBotStatusTool];
