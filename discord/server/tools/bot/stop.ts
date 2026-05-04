import { createPrivateTool } from "@decocms/runtime/tools";
import { z } from "zod";
import type { Env } from "../../types/env.ts";
import { shutdownBot } from "../../bot/manager.ts";

export const createBotStopTool = (_env: Env) =>
  createPrivateTool({
    id: "DISCORD_BOT_STOP",
    description:
      "Stop the Discord bot for this connection (disconnects from the Gateway). Bot will auto-restart on next config save or hourly health check.",
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
      try {
        await shutdownBot(env);
        return { success: true, message: "Discord bot stopped." };
      } catch (err) {
        return {
          success: false,
          message: `Failed to stop bot: ${err instanceof Error ? err.message : String(err)}`,
        };
      }
    },
  });
