/**
 * Bot Control Tools
 *
 * Tools for starting, stopping, and checking bot status.
 */

import { createPrivateTool } from "@decocms/runtime/tools";
import { z } from "zod";
import type { Env } from "../types/env.ts";
import {
  ensureBotRunning,
  isBotRunning,
  shutdownBot,
  getBotStatus,
} from "../bot-manager.ts";
import { getDiscordClient } from "../discord/client.ts";

/**
 * Start the Discord bot
 */
export const createStartBotTool = (env: Env) =>
  createPrivateTool({
    id: "DISCORD_BOT_START",
    description:
      "Start the Discord bot. The bot will connect to Discord Gateway using the saved configuration from Supabase.",
    annotations: { destructiveHint: false },
    inputSchema: z.object({}).strict(),
    outputSchema: z
      .object({
        success: z.boolean(),
        message: z.string(),
        botTag: z.string().optional(),
        guilds: z.number().optional(),
      })
      .strict(),
    execute: async (params: any) => {
      const { env } = params;

      console.log("[Tool] DISCORD_BOT_START called");

      if (!env) {
        // Fallback: Try to get env from bot-manager
        const { getCurrentEnv } = await import("../bot-manager.ts");
        const currentEnv = getCurrentEnv();
        if (currentEnv) {
          const started = await ensureBotRunning(currentEnv);
          if (!started) {
            return {
              success: false,
              message:
                "Failed to start bot. Make sure you have saved configuration using DISCORD_SAVE_CONFIG.",
            };
          }
          const client = getDiscordClient();
          return {
            success: true,
            message: `Discord bot started successfully! Connected as ${client?.user?.tag || "Unknown"}`,
            botTag: client?.user?.tag || "Unknown",
            guilds: client?.guilds.cache.size || 0,
          };
        }

        return {
          success: false,
          message:
            "Environment not available. Please save the configuration first using DISCORD_SAVE_CONFIG.",
        };
      }

      try {
        const started = await ensureBotRunning(env);

        if (!started) {
          return {
            success: false,
            message:
              "Failed to start bot. Make sure you have saved configuration using DISCORD_SAVE_CONFIG.",
          };
        }

        const client = getDiscordClient();
        const botTag = client?.user?.tag || "Unknown";
        const guilds = client?.guilds.cache.size || 0;

        return {
          success: true,
          message: `Discord bot started successfully! Connected as ${botTag}`,
          botTag,
          guilds,
        };
      } catch (error) {
        return {
          success: false,
          message: `Failed to start bot: ${error instanceof Error ? error.message : "Unknown error"}`,
        };
      }
    },
  });

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
    execute: async () => {
      console.log("[Tool] DISCORD_BOT_STOP called");

      try {
        await shutdownBot();

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
    execute: async () => {
      console.log("[Tool] DISCORD_BOT_STATUS called");

      const running = isBotRunning();
      const client = getDiscordClient();

      if (!running || !client) {
        return {
          running: false,
          message:
            "Discord bot is not running. Use DISCORD_BOT_START to start it.",
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
export const botTools = [
  createStartBotTool,
  createStopBotTool,
  createBotStatusTool,
];
