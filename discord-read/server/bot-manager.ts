/**
 * Bot Manager
 *
 * Manages Discord bot lifecycle - auto-starts on first request.
 */

import type { Env } from "./types/env.ts";
import {
  initializeDiscordClient,
  getDiscordClient,
  shutdownDiscordClient,
} from "./discord/client.ts";
import { setDatabaseEnv } from "../shared/db.ts";
import { ensureCollections, ensureIndexes } from "./db/index.ts";
import {
  startHeartbeat,
  stopHeartbeat,
  isSessionActive,
  getSessionStatus,
} from "./session-keeper.ts";

// Global state
let botInitializing = false;
let _botInitialized = false;

// Store the latest env globally for access in event handlers
let _currentEnv: Env | null = null;

// Store essential config that doesn't depend on env (for fallback)
interface StoredConfig {
  meshUrl: string;
  organizationId: string;
  persistentToken: string;
  modelProviderId?: string;
  modelId?: string;
  agentId?: string;
  whisperConnectionId?: string;
}
let _storedConfig: StoredConfig | null = null;

/**
 * Store essential config for fallback when env is not available
 */
export function storeEssentialConfig(config: StoredConfig): void {
  _storedConfig = config;
  console.log("[BotManager] Essential config stored for fallback");
}

/**
 * Get stored essential config
 */
export function getStoredConfig(): StoredConfig | null {
  return _storedConfig;
}

/**
 * Update the stored environment (called when new requests come in)
 */
export function updateEnv(env: Env): void {
  _currentEnv = env;
  // Also update database env
  setDatabaseEnv(env);
}

/**
 * Get the current stored environment
 */
export function getCurrentEnv(): Env | null {
  return _currentEnv;
}

/**
 * Ensure bot is running. Call this from any tool or handler.
 * Returns true if bot is ready, false if still initializing or failed.
 */
export async function ensureBotRunning(env: Env): Promise<boolean> {
  // Always update the stored env with latest context
  updateEnv(env);

  // Already running
  const client = getDiscordClient();
  if (client?.isReady()) {
    return true;
  }

  // Already initializing (prevent multiple concurrent inits)
  if (botInitializing) {
    console.log("[BotManager] Bot is already initializing, waiting...");
    // Wait a bit and check again
    await new Promise((resolve) => setTimeout(resolve, 2000));
    return getDiscordClient()?.isReady() ?? false;
  }

  // Check if we have the required config
  const botToken = env.MESH_REQUEST_CONTEXT?.state?.BOT_TOKEN;
  if (!botToken) {
    console.log("[BotManager] BOT_TOKEN not configured");
    return false;
  }

  // Start initialization
  botInitializing = true;
  console.log("[BotManager] Auto-starting Discord bot...");

  try {
    // Set database env
    setDatabaseEnv(env);

    // Ensure database tables exist
    await ensureCollections(env);
    await ensureIndexes(env);
    console.log("[BotManager] Database ready");

    // Initialize Discord client
    await initializeDiscordClient(env);
    _botInitialized = true;
    console.log("[BotManager] Discord bot started ✓");

    // Configure voice system after bot starts
    await configureVoiceSystemInternal(env);

    // Start session heartbeat to keep Mesh connection alive
    startHeartbeat(env, () => {
      console.log(
        "[BotManager] ⚠️ Mesh session expired! Bot will continue but LLM/DB calls may fail.",
      );
      console.log(
        "[BotManager] 💡 Click 'Save' in Mesh Dashboard to refresh the session.",
      );
    });

    return true;
  } catch (error) {
    console.error("[BotManager] Failed to start bot:", error);
    return false;
  } finally {
    botInitializing = false;
  }
}

/**
 * Check if bot is running.
 */
export function isBotRunning(): boolean {
  return getDiscordClient()?.isReady() ?? false;
}

/**
 * Get bot status info.
 */
export function getBotStatus() {
  const client = getDiscordClient();
  const sessionStatus = getSessionStatus();

  if (!client || !client.isReady()) {
    return {
      running: false,
      initializing: botInitializing,
      meshSession: sessionStatus,
    };
  }

  return {
    running: true,
    initializing: false,
    user: client.user?.tag,
    guilds: client.guilds.cache.size,
    uptime: client.uptime,
    meshSession: sessionStatus,
  };
}

/**
 * Shutdown the bot.
 */
export async function shutdownBot(): Promise<void> {
  stopHeartbeat();
  await shutdownDiscordClient();
  _botInitialized = false;
  botInitializing = false;
}

/**
 * Configure voice system after bot starts or restarts.
 * This is called from ensureBotRunning and can be called externally.
 */
export async function configureVoiceSystemInternal(env: Env): Promise<void> {
  const client = getDiscordClient();
  if (!client?.isReady()) {
    console.log("[BotManager] Cannot configure voice - client not ready");
    return;
  }

  const state = env.MESH_REQUEST_CONTEXT?.state;
  const rawVoiceConfig = state?.VOICE_CONFIG;

  // Voice is enabled by default
  const voiceConfig = {
    ENABLED: rawVoiceConfig?.ENABLED ?? true,
    RESPONSE_MODE: rawVoiceConfig?.RESPONSE_MODE || "voice",
    TTS_ENABLED: rawVoiceConfig?.TTS_ENABLED !== false,
    TTS_LANGUAGE: rawVoiceConfig?.TTS_LANGUAGE || "pt-BR",
    SILENCE_THRESHOLD_MS: rawVoiceConfig?.SILENCE_THRESHOLD_MS || 1000,
  };

  if (!voiceConfig.ENABLED) {
    console.log("[BotManager] Voice is disabled");
    return;
  }

  try {
    const { configureVoiceCommands, configureTTS } = await import(
      "./voice/index.ts"
    );
    const { generateResponse } = await import("./llm.ts");
    const { getSystemPrompt } = await import("./prompts/system.ts");

    configureVoiceCommands(
      client,
      {
        enabled: voiceConfig.ENABLED,
        responseMode: voiceConfig.RESPONSE_MODE as "voice" | "dm" | "both",
        ttsEnabled: voiceConfig.TTS_ENABLED,
        ttsLanguage: voiceConfig.TTS_LANGUAGE,
        silenceThresholdMs: voiceConfig.SILENCE_THRESHOLD_MS,
      },
      {
        processVoiceCommand: async (
          userId: string,
          username: string,
          text: string,
          guildId: string,
        ) => {
          // Get guild info from Discord client
          const client = getDiscordClient();
          const guild = client
            ? await client.guilds.fetch(guildId).catch(() => null)
            : null;

          const systemPrompt = getSystemPrompt({
            guildId,
            guildName: guild?.name,
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

    configureTTS({
      enabled: voiceConfig.TTS_ENABLED,
      language: voiceConfig.TTS_LANGUAGE,
    });

    console.log("[BotManager] Voice system configured:", {
      enabled: voiceConfig.ENABLED,
      responseMode: voiceConfig.RESPONSE_MODE,
      ttsEnabled: voiceConfig.TTS_ENABLED,
      ttsLanguage: voiceConfig.TTS_LANGUAGE,
    });
  } catch (error) {
    console.error("[BotManager] Failed to configure voice:", error);
  }
}

/**
 * Check if the Mesh session is active
 */
export function isMeshSessionActive(): boolean {
  return isSessionActive();
}

/**
 * Get detailed session status
 */
export function getMeshSessionStatus() {
  return getSessionStatus();
}
