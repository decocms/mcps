/**
 * Discord MCP Server - Main Entry Point
 *
 * MCP server for Discord bot integration with message indexing
 * and AI agent commands.
 */

import { serve } from "@decocms/mcps-shared/serve";
import { withRuntime } from "@decocms/runtime";
import {
  initializeDiscordClient,
  getDiscordClient,
  shutdownDiscordClient,
} from "./discord/client.ts";
import { setDatabaseEnv } from "../shared/db.ts";
import { updateEnv, getCurrentEnv } from "./bot-manager.ts";
import { tools } from "./tools/index.ts";
import { type Env, type Registry, StateSchema } from "./types/env.ts";
import { logger, HyperDXLogger } from "./lib/logger.ts";
import { app as webhookRouter } from "./router.ts";

export { StateSchema };

// ============================================================================
// STARTUP DEBUGGING
// ============================================================================
// Generate unique instance ID to detect multiple instances running
const INSTANCE_ID = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

console.log("=".repeat(80));
console.log("[STARTUP] Discord MCP Server initializing...");
console.log(`[STARTUP] 🆔 Instance ID: ${INSTANCE_ID}`);
console.log(`[STARTUP] Node.js version: ${process.version}`);
console.log(`[STARTUP] Bun version: ${Bun.version}`);
console.log(`[STARTUP] NODE_ENV: ${process.env.NODE_ENV || "not set"}`);
console.log(`[STARTUP] PORT: ${process.env.PORT || "not set"}`);
console.log(`[STARTUP] Working directory: ${process.cwd()}`);
console.log("=".repeat(80));

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
      const traceId = HyperDXLogger.generateTraceId();

      logger.info("Configuration changed", {
        trace_id: traceId,
        organizationId: env.MESH_REQUEST_CONTEXT?.organizationId,
        connectionId: env.MESH_REQUEST_CONTEXT?.connectionId,
      });

      // Update global env for Discord bot handlers
      updateEnv(env);

      // Set database env for shared module
      setDatabaseEnv(env);

      // Get configuration from state
      const state = env.MESH_REQUEST_CONTEXT?.state;
      const meshUrl = env.MESH_REQUEST_CONTEXT?.meshUrl;
      const organizationId = env.MESH_REQUEST_CONTEXT?.organizationId;
      const token = env.MESH_REQUEST_CONTEXT?.token;

      // Configure HyperDX logger if API key is provided
      if (state?.HYPERDX_API_KEY) {
        logger.setApiKey(state.HYPERDX_API_KEY);
        logger.info("HyperDX logger configured", {
          trace_id: traceId,
          organizationId,
        });
      }

      // Create tables first, then indexes
      // Database tables are managed via Supabase - no need to ensure here
      console.log("[Setup] Skipping database initialization (using Supabase)");

      logger.info("Database tables ready", {
        trace_id: traceId,
        organizationId,
      });

      // Configure LLM if model provider is set
      const modelProvider = state?.MODEL_PROVIDER;
      const agent = state?.AGENT;
      const languageModel = state?.LANGUAGE_MODEL;

      // Extract values
      const languageModelConnectionId = languageModel?.value?.connectionId;
      const modelProviderId: string | undefined =
        (typeof modelProvider?.value === "string"
          ? modelProvider.value
          : undefined) ||
        (typeof languageModelConnectionId === "string"
          ? languageModelConnectionId
          : undefined);
      const agentId: string | undefined =
        typeof agent?.value === "string" ? agent.value : undefined;
      const agentMode = state?.AGENT_MODE ?? "smart_tool_selection";
      const modelId = languageModel?.value?.id;

      // Configure LLM module
      if (modelProviderId && token && meshUrl && organizationId) {
        const { configureLLM, configureStreaming } = await import("./llm.ts");

        configureLLM({
          meshUrl,
          organizationId,
          token,
          modelProviderId,
          modelId,
          agentId,
          agentMode,
        });

        // Configure streaming (default: enabled)
        const enableStreaming =
          state?.RESPONSE_CONFIG?.ENABLE_STREAMING ?? true;
        configureStreaming(enableStreaming);

        console.log("[CONFIG] LLM configured:", {
          modelProviderId,
          modelId,
          agentId: agentId || "not set",
          streaming: enableStreaming,
        });
      }

      // NOTE: Discord client is NOT auto-initialized on config save
      // User must manually start the bot using DISCORD_BOT_START tool
      // This prevents issues with multiple instances and unwanted bot starts
      const hasAuth = !!env.MESH_REQUEST_CONTEXT?.authorization;
      if (hasAuth) {
        if (discordInitialized && getDiscordClient()) {
          console.log("[CONFIG] ✅ Bot is running");
        } else {
          console.log(
            "[CONFIG] ℹ️ Bot not started. Use DISCORD_BOT_START tool to start the bot.",
          );
        }
      } else {
        logger.info(
          "Discord Bot Token not configured - waiting for authorization",
          {
            trace_id: traceId,
            organizationId,
          },
        );
      }
    },
    scopes: ["EVENT_BUS::*", "CONNECTION::*", "MODEL_PROVIDER::*", "*"],
    state: StateSchema,
  },
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  tools: tools as any,
  prompts: [],
});

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

// ============================================================================
// START HTTP SERVER FIRST (before any Discord initialization)
// ============================================================================
console.log("[SERVER] Starting HTTP server...");
console.log(
  `[SERVER] PORT env variable: ${process.env.PORT || "not set (will use default)"}`,
);

/**
 * Serve requests:
 * - Webhook routes handled by webhookRouter (/discord/interactions, /health)
 * - MCP requests handled by runtime
 */
try {
  serve(async (req, env, ctx) => {
    // Try webhook router first
    const webhookResponse = await webhookRouter.fetch(req, env, ctx);

    // If webhook router returned 404, fall back to MCP runtime
    if (webhookResponse.status === 404) {
      return runtime.fetch(req, env, ctx);
    }

    return webhookResponse;
  });
  console.log("[SERVER] ✅ serve() called successfully");
  console.log("[SERVER] Webhook endpoint: /discord/interactions/:connectionId");
  console.log("[SERVER] Health check: /health");
} catch (error) {
  console.error("[SERVER] ❌ Failed to start server:", error);
  throw error;
}

console.log(`
╔══════════════════════════════════════════════════════════╗
║              Discord MCP Server Started                  ║
╠══════════════════════════════════════════════════════════╣
║  Status:        ✅ HTTP Server Ready                      ║
║  Discord Bot:   Waiting for configuration...             ║
╚══════════════════════════════════════════════════════════╝
`);

console.log(`
📡 MCP Server ready!

💡 The Discord bot will start when Mesh sends the configuration.
   → Open Mesh Dashboard and click on this MCP to trigger initialization.
   → Or use the tools in the dashboard.

⚠️  Press Ctrl+C to gracefully shutdown the Discord bot.
`);

// ============================================================================
// BOT INITIALIZATION
// ============================================================================
// Bot will be initialized via:
// 1. onChange configuration callback (when Mesh sends config)
// 2. DISCORD_BOT_START tool (manual start)

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

    const hasAuth = !!env.MESH_REQUEST_CONTEXT?.authorization;
    if (!hasAuth) {
      console.log(
        "[AUTO-RESTART] No authorization configured, skipping restart",
      );
      return;
    }

    try {
      await initializeDiscordClient(env);
      discordInitialized = true;
      console.log("[AUTO-RESTART] Bot restarted successfully ✓");
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
// Use setImmediate to ensure this runs after HTTP server is ready
setImmediate(() => {
  autoRestartInterval = setInterval(autoRestartCheck, AUTO_RESTART_INTERVAL_MS);
  console.log(`[CRON] Auto-restart check scheduled every 1 hour`);

  // Run initial check after 30 seconds (give time for normal startup and HTTP server)
  setTimeout(autoRestartCheck, 30000);
});
