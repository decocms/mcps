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
// Global state
let botInitializing = false;
let _botInitialized = false;

// Store the latest env globally for access in event handlers
let _currentEnv: Env | null = null;

// Store essential config that doesn't depend on env (for fallback)
interface StoredConfig {
  meshUrl: string;
  organizationId: string;
  persistentToken: string; // API key (preferred) or session token
  isApiKey: boolean; // true if persistentToken is an API key (never expires)
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

  // Check if we have a saved config or authorization header
  const connectionId =
    env.MESH_REQUEST_CONTEXT?.connectionId || "default-connection";
  const { getDiscordConfig } = await import("./lib/config-cache.ts");
  const savedConfig = await getDiscordConfig(connectionId).catch(() => null);

  const hasAuth = !!env.MESH_REQUEST_CONTEXT?.authorization;
  const hasSavedConfig = !!savedConfig?.botToken;

  if (!hasAuth && !hasSavedConfig) {
    console.log(
      "[BotManager] Bot not configured. Use DISCORD_SAVE_CONFIG to save configuration or add token in Authorization header.",
    );
    return false;
  }

  if (hasSavedConfig) {
    console.log("[BotManager] Found saved configuration in Supabase");
  }

  // Start initialization
  botInitializing = true;
  console.log("[BotManager] Auto-starting Discord bot...");

  try {
    // Set database env
    setDatabaseEnv(env);

    // Ensure database tables exist
    // Database tables are managed via Supabase - no need to ensure here
    console.log(
      "[BotManager] Skipping database initialization (using Supabase)",
    );
    console.log("[BotManager] Database ready");

    // Initialize Discord client
    await initializeDiscordClient(env);
    _botInitialized = true;
    console.log("[BotManager] Discord bot started ✓");

    // Configure voice system after bot starts
    await configureVoiceSystemInternal(env);

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

  if (!client || !client.isReady()) {
    return {
      running: false,
      initializing: botInitializing,
    };
  }

  return {
    running: true,
    initializing: false,
    user: client.user?.tag,
    guilds: client.guilds.cache.size,
    uptime: client.uptime,
  };
}

/**
 * Shutdown the bot.
 */
export async function shutdownBot(): Promise<void> {
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

          console.log("[VoiceCommands] DEBUG - Building system prompt with:", {
            guildId,
            guildName: guild?.name,
            userId,
            userName: username,
          });

          const systemPrompt = getSystemPrompt({
            guildId,
            guildName: guild?.name,
            userId,
            userName: username,
            isDM: false,
          });

          // Log a part of the system prompt to verify guild ID is included
          const guildIdInPrompt = systemPrompt.includes(guildId);
          console.log(
            "[VoiceCommands] DEBUG - System prompt includes correct guildId:",
            guildIdInPrompt,
          );
          if (!guildIdInPrompt) {
            console.warn(
              "[VoiceCommands] ⚠️ WARNING: guildId NOT found in system prompt!",
            );
          }

          const messages = [
            { role: "system" as const, content: systemPrompt },
            {
              role: "system" as const,
              content:
                "O usuário está falando através de um canal de voz. REGRAS OBRIGATÓRIAS:\n" +
                "1. Seja EXTREMAMENTE objetivo e direto\n" +
                "2. Máximo 2-3 frases curtas\n" +
                "3. Sem explicações longas ou detalhes desnecessários\n" +
                "4. Sem saudações ou introduções\n" +
                "5. Vá direto ao ponto\n" +
                "6. Se precisar usar uma tool, use e responda apenas o resultado\n" +
                "Exemplo BOM: 'Entrei no canal e mandei oi para o Lucas.'\n" +
                "Exemplo RUIM: 'Desculpe, estou tendo dificuldades...' [explicação longa]",
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
