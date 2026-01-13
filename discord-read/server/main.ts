/**
 * Discord MCP Server - Main Entry Point
 *
 * MCP server for Discord bot integration with message indexing
 * and AI agent commands.
 */

import { serve } from "@decocms/mcps-shared/serve";
import { withRuntime } from "@decocms/runtime";
import { ensureCollections, ensureIndexes } from "./db/index.ts";
import {
  initializeDiscordClient,
  getDiscordClient,
  shutdownDiscordClient,
} from "./discord/client.ts";
import { setDatabaseEnv } from "../shared/db.ts";
import { updateEnv } from "./bot-manager.ts";
import { tools } from "./tools/index.ts";
import { type Env, type Registry, StateSchema } from "./types/env.ts";

export { StateSchema };

// Track Discord client state
let discordInitialized = false;

const runtime = withRuntime<Env, typeof StateSchema, Registry>({
  events: {
    handlers: {
      SELF: {
        events: ["discord.*"],
        handler: async ({ events }, env) => {
          try {
            for (const event of events) {
              console.log(`[SELF] Event: ${event.type}`);
            }
            return { success: true };
          } catch (error) {
            console.error(`[SELF] Error:`, error);
            return { success: false };
          }
        },
      },
      EVENT_BUS: {
        handler: async ({ events }, env) => {
          try {
            for (const event of events) {
              console.log(`[EVENT_BUS] Event: ${event.type}`);
            }
            return { success: true };
          } catch (error) {
            console.error(`[EVENT_BUS] Error:`, error);
            return { success: false };
          }
        },
        events: ["discord.*"],
      },
    },
  },
  configuration: {
    onChange: async (env) => {
      console.log("[CONFIG] Configuration changed");

      // Update global env for Discord bot handlers
      updateEnv(env);

      // Set database env for shared module
      setDatabaseEnv(env);

      // Create tables first, then indexes
      await ensureCollections(env);
      await ensureIndexes(env);
      console.log("[CONFIG] Database tables ready");

      // Initialize Discord client if BOT_TOKEN is provided
      const botToken = env.MESH_REQUEST_CONTEXT?.state?.BOT_TOKEN;
      if (botToken && !discordInitialized && !getDiscordClient()) {
        console.log("[CONFIG] Initializing Discord client...");
        try {
          await initializeDiscordClient(env);
          discordInitialized = true;
          console.log("[CONFIG] Discord client ready ✓");
        } catch (error) {
          console.error("[CONFIG] Failed to initialize Discord:", error);
        }
      } else if (!botToken) {
        console.log(
          "[CONFIG] BOT_TOKEN not configured - Discord bot waiting...",
        );
      }
    },
    scopes: [
      "DATABASE::DATABASES_RUN_SQL",
      "EVENT_BUS::*",
      "CONNECTION::*",
      "MODEL_PROVIDER::*",
      "*",
    ],
    state: StateSchema,
  },
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  tools: tools as any,
  prompts: [],
});

const PORT = process.env.PORT || 8001;

// Graceful shutdown handler - destroy Discord client when process exits
async function gracefulShutdown(signal: string) {
  console.log(`\n[SHUTDOWN] Received ${signal}, shutting down...`);

  try {
    const client = getDiscordClient();
    if (client) {
      console.log("[SHUTDOWN] Destroying Discord client...");
      await shutdownDiscordClient();
      console.log("[SHUTDOWN] Discord client destroyed ✓");
    }
  } catch (error) {
    console.error("[SHUTDOWN] Error during shutdown:", error);
  }

  process.exit(0);
}

// Register shutdown handlers
process.on("SIGINT", () => gracefulShutdown("SIGINT"));
process.on("SIGTERM", () => gracefulShutdown("SIGTERM"));
process.on("beforeExit", () => gracefulShutdown("beforeExit"));

// Also handle uncaught exceptions to cleanup
process.on("uncaughtException", async (error) => {
  console.error("[CRASH] Uncaught exception:", error);
  await gracefulShutdown("uncaughtException");
});

serve(runtime.fetch);

console.log(`
╔══════════════════════════════════════════════════════════╗
║              Discord MCP Server Started                  ║
╠══════════════════════════════════════════════════════════╣
║  MCP Server:    http://localhost:${String(PORT).padEnd(5)}                  ║
║  Discord Bot:   Initializing...                          ║
╚══════════════════════════════════════════════════════════╝
`);

console.log(`
📡 MCP Server ready!

💡 The Discord bot will start when Mesh sends the configuration.
   → Open Mesh Dashboard and click on this MCP to trigger initialization.
   → Or use the tools in the dashboard.

⚠️  Press Ctrl+C to gracefully shutdown the Discord bot.
`);

// Auto-start Discord bot if BOT_TOKEN is in environment
const envBotToken = process.env.BOT_TOKEN || process.env.DISCORD_BOT_TOKEN;
if (envBotToken && !discordInitialized) {
  console.log(
    "[STARTUP] BOT_TOKEN found in environment, starting Discord bot...",
  );

  // Create a minimal env with the token for startup
  const startupEnv = {
    MESH_REQUEST_CONTEXT: {
      state: {
        BOT_TOKEN: envBotToken,
        COMMAND_PREFIX: process.env.COMMAND_PREFIX || "!",
        GUILD_ID: process.env.GUILD_ID,
      },
    },
  } as Env;

  // Update global env
  updateEnv(startupEnv);
  setDatabaseEnv(startupEnv);

  // Initialize Discord client
  initializeDiscordClient(startupEnv)
    .then(() => {
      discordInitialized = true;
      console.log("[STARTUP] Discord bot started from environment ✓");
    })
    .catch((error) => {
      console.error("[STARTUP] Failed to start Discord bot:", error);
    });
}
