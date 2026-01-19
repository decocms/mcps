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
import { updateEnv, getCurrentEnv } from "./bot-manager.ts";
import { tools } from "./tools/index.ts";
import { type Env, type Registry, StateSchema } from "./types/env.ts";
import {
  startHeartbeat,
  stopHeartbeat,
  resetSession,
} from "./session-keeper.ts";

export { StateSchema };

// Track Discord client state
let discordInitialized = false;

// Auto-restart cron interval (1 hour)
const AUTO_RESTART_INTERVAL_MS = 60 * 60 * 1000;
let autoRestartInterval: ReturnType<typeof setInterval> | null = null;

const runtime = withRuntime<Env, typeof StateSchema, Registry>({
  events: {
    handlers: {
      SELF: {
        events: ["discord.*"],
        handler: async ({ events }) => {
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
        handler: async ({ events }) => {
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

      // Reset session status - we have fresh credentials from Mesh
      resetSession();

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

          // Start heartbeat to keep Mesh session alive
          startHeartbeat(env, () => {
            console.log(
              "[CONFIG] ⚠️ Mesh session expired! Click 'Save' in Dashboard to refresh.",
            );
          });
        } catch (error) {
          console.error("[CONFIG] Failed to initialize Discord:", error);
        }
      } else if (botToken && discordInitialized) {
        // Bot already running, just restart heartbeat with fresh credentials
        console.log("[CONFIG] Refreshing session heartbeat...");
        startHeartbeat(env, () => {
          console.log(
            "[CONFIG] ⚠️ Mesh session expired! Click 'Save' in Dashboard to refresh.",
          );
        });
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

const PORT = process.env.PORT;

// Graceful shutdown handler - destroy Discord client when process exits
async function gracefulShutdown(signal: string) {
  console.log(`\n[SHUTDOWN] Received ${signal}, shutting down...`);

  try {
    // Stop auto-restart cron
    if (autoRestartInterval) {
      console.log("[SHUTDOWN] Stopping auto-restart cron...");
      clearInterval(autoRestartInterval);
      autoRestartInterval = null;
    }

    // Stop session heartbeat
    console.log("[SHUTDOWN] Stopping session heartbeat...");
    stopHeartbeat();

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

      // Start heartbeat (will use env vars, may not have full Mesh context)
      startHeartbeat(startupEnv, () => {
        console.log(
          "[STARTUP] ⚠️ Mesh session expired! Click 'Save' in Dashboard to refresh.",
        );
      });
    })
    .catch((error) => {
      console.error("[STARTUP] Failed to start Discord bot:", error);
    });
}

// ============================================================================
// Auto-Restart Cron Job (every 1 hour)
// ============================================================================

/**
 * Check if the bot is running and restart if needed.
 * Runs every hour to ensure the bot stays online.
 */
async function autoRestartCheck(): Promise<void> {
  const client = getDiscordClient();

  if (!client || !client.isReady()) {
    console.log("[AUTO-RESTART] Bot is down, attempting restart...");

    const env = getCurrentEnv();
    if (!env) {
      console.log("[AUTO-RESTART] No environment available, skipping restart");
      return;
    }

    const botToken = env.MESH_REQUEST_CONTEXT?.state?.BOT_TOKEN;
    if (!botToken) {
      console.log("[AUTO-RESTART] No BOT_TOKEN configured, skipping restart");
      return;
    }

    try {
      await initializeDiscordClient(env);
      discordInitialized = true;
      console.log("[AUTO-RESTART] Bot restarted successfully ✓");

      // Restart heartbeat
      startHeartbeat(env, () => {
        console.log(
          "[AUTO-RESTART] ⚠️ Mesh session expired! Click 'Save' in Dashboard to refresh.",
        );
      });
    } catch (error) {
      console.error(
        "[AUTO-RESTART] Failed to restart bot:",
        error instanceof Error ? error.message : String(error),
      );
    }
  } else {
    console.log(
      `[AUTO-RESTART] Bot is healthy (${client.guilds.cache.size} guilds)`,
    );
  }
}

// Start auto-restart cron
autoRestartInterval = setInterval(autoRestartCheck, AUTO_RESTART_INTERVAL_MS);
console.log(`[CRON] Auto-restart check scheduled every 1 hour`);

// Run initial check after 5 seconds (give time for normal startup)
setTimeout(autoRestartCheck, 5000);
