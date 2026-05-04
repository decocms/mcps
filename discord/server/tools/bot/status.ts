import { createPrivateTool } from "@decocms/runtime/tools";
import { z } from "zod";
import type { Env } from "../../types/env.ts";
import { getBotStatus } from "../../bot/manager.ts";

export const createBotStatusTool = (_env: Env) =>
  createPrivateTool({
    id: "DISCORD_BOT_STATUS",
    description:
      "Return runtime status of the Discord bot for this connection: ready, guild count, gateway ping, uptime.",
    annotations: { readOnlyHint: true },
    inputSchema: z.object({}).strict(),
    outputSchema: z
      .object({
        running: z.boolean(),
        initializing: z.boolean(),
        user: z.string().optional(),
        guilds: z.number().optional(),
        uptime: z.number().nullable().optional(),
        ping: z.number().optional(),
      })
      .strict(),
    execute: async (params: any) => {
      const env = params.runtimeContext?.env;
      return getBotStatus(env);
    },
  });
