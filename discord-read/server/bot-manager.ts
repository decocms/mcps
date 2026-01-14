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

// Global state
let botInitializing = false;
let _botInitialized = false;

// Store the latest env globally for access in event handlers
let _currentEnv: Env | null = null;

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
