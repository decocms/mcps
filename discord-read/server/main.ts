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
import { logger, HyperDXLogger } from "./lib/logger.ts";

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
      const traceId = HyperDXLogger.generateTraceId();

      logger.info("Configuration changed", {
        trace_id: traceId,
        organizationId: env.MESH_REQUEST_CONTEXT?.organizationId,
        connectionId: env.MESH_REQUEST_CONTEXT?.connectionId,
      });

      // Reset session status - we have fresh credentials from Mesh
      resetSession();

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
      await ensureCollections(env);
      await ensureIndexes(env);

      logger.info("Database tables ready", {
        trace_id: traceId,
        organizationId,
      });

      // Configure LLM if model provider is set
      const modelProvider = state?.MODEL_PROVIDER;
      const agent = state?.AGENT;
      const languageModel = state?.LANGUAGE_MODEL;
      const whisper = state?.WHISPER;

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
        const { configureLLM, configureStreaming, configureWhisper } =
          await import("./llm.ts");

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

        // Configure Whisper for audio transcription if set
        if (whisper && typeof whisper.value === "string") {
          configureWhisper({
            meshUrl,
            organizationId,
            token,
            whisperConnectionId: whisper.value,
          });
          console.log("[CONFIG] Whisper configured for audio transcription");

          // Also configure Whisper for voice STT
          const { configureVoiceWhisper } = await import("./voice/index.ts");
          configureVoiceWhisper({
            meshUrl,
            organizationId,
            token,
            whisperConnectionId: whisper.value,
          });
        }
      }

      // Configure voice system if enabled
      const voiceConfig = state?.VOICE_CONFIG;
      if (voiceConfig?.ENABLED) {
        const { configureVoiceCommands, configureTTS } = await import(
          "./voice/index.ts"
        );
        const { generateResponse } = await import("./llm.ts");
        const { getSystemPrompt } = await import("./prompts/system.ts");

        const client = getDiscordClient();
        if (client) {
          configureVoiceCommands(
            client,
            {
              enabled: voiceConfig.ENABLED,
              responseMode: voiceConfig.RESPONSE_MODE || "voice",
              ttsEnabled: voiceConfig.TTS_ENABLED !== false,
              ttsLanguage: voiceConfig.TTS_LANGUAGE || "pt-BR",
              silenceThresholdMs: voiceConfig.SILENCE_THRESHOLD_MS || 1000,
            },
            {
              // Voice command handler - uses LLM to process voice commands
              processVoiceCommand: async (
                userId: string,
                username: string,
                text: string,
                guildId: string,
              ) => {
                const systemPrompt = getSystemPrompt({
                  guildId,
                  userId,
                  userName: username,
                  isDM: false,
                });

                const messages = [
                  { role: "system" as const, content: systemPrompt },
                  {
                    role: "system" as const,
                    content:
                      "O usuário está falando através de um canal de voz. Responda de forma concisa e natural para ser falada em voz alta.",
                  },
                  { role: "user" as const, content: text },
                ];

                const response = await generateResponse(env, messages);
                return response.content;
              },
            },
          );

          // Configure TTS
          configureTTS({
            enabled: voiceConfig.TTS_ENABLED !== false,
            language: voiceConfig.TTS_LANGUAGE || "pt-BR",
          });

          console.log("[CONFIG] Voice commands configured:", {
            enabled: voiceConfig.ENABLED,
            responseMode: voiceConfig.RESPONSE_MODE,
            ttsEnabled: voiceConfig.TTS_ENABLED !== false,
            ttsLanguage: voiceConfig.TTS_LANGUAGE || "pt-BR",
          });
        }
      }

      // Initialize Discord client if Authorization header is provided
      const hasAuth = !!env.MESH_REQUEST_CONTEXT?.authorization;
      if (hasAuth && !discordInitialized && !getDiscordClient()) {
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
      } else if (hasAuth && discordInitialized) {
        // Bot already running, just restart heartbeat with fresh credentials
        console.log("[CONFIG] Refreshing session heartbeat...");
        startHeartbeat(env, () => {
          console.log(
            "[CONFIG] ⚠️ Mesh session expired! Click 'Save' in Dashboard to refresh.",
          );
        });
      } else if (!hasAuth) {
        logger.info(
          "Discord Bot Token not configured - waiting for authorization",
          {
            trace_id: traceId,
            organizationId,
          },
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

    // Stop all voice sessions
    try {
      const { stopAllSessions, disconnectAll } = await import(
        "./voice/index.ts"
      );
      console.log("[SHUTDOWN] Stopping voice sessions...");
      await stopAllSessions();
      disconnectAll();
    } catch {
      // Voice module might not be loaded
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

// Auto-start Discord bot if BOT_TOKEN is in environment (for local development)
const envBotToken = process.env.BOT_TOKEN || process.env.DISCORD_BOT_TOKEN;
if (envBotToken && !discordInitialized) {
  console.log(
    "[STARTUP] Bot token found in environment, starting Discord bot...",
  );

  // Create a minimal env with the token as authorization for startup
  const startupEnv = {
    MESH_REQUEST_CONTEXT: {
      authorization: `Bearer ${envBotToken}`,
      state: {
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
