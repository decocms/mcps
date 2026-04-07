/**
 * Bot Manager
 *
 * Manages Discord bot lifecycle per connection (multi-tenant).
 * Each connectionId gets its own Discord client and state.
 */

import type { Env } from "./types/env.ts";
import {
  initializeDiscordClient,
  shutdownDiscordClient,
} from "./discord/client.ts";
import { setDatabaseEnv } from "../shared/db.ts";
import {
  getInstance,
  getOrCreateInstance,
  getAllInstances,
  removeInstance,
} from "./bot-instance.ts";

function getConnectionId(env: Env): string {
  return env.MESH_REQUEST_CONTEXT?.connectionId || "default-connection";
}

/**
 * Update the stored environment for a specific connection.
 */
export function updateEnv(env: Env): void {
  const connectionId = getConnectionId(env);
  const instance = getOrCreateInstance(connectionId, env);
  instance.env = env;
  // Also update database env (shared Supabase credentials)
  setDatabaseEnv(env);
}

/**
 * Get the current stored environment for a connection.
 * If no connectionId is provided, returns undefined (no more global fallback).
 */
export function getCurrentEnv(connectionId?: string): Env | null {
  if (!connectionId) return null;
  return getInstance(connectionId)?.env ?? null;
}

/**
 * Ensure bot is running for this connection.
 * Returns true if bot is ready, false if still initializing or failed.
 */
export async function ensureBotRunning(env: Env): Promise<boolean> {
  const connectionId = getConnectionId(env);
  const instance = getOrCreateInstance(connectionId, env);

  // Always update env with latest context
  instance.env = env;
  setDatabaseEnv(env);

  // Already running for this connection
  if (instance.client?.isReady()) {
    return true;
  }

  // Already initializing this connection (prevent concurrent inits)
  if (instance.initializing) {
    console.log(
      `[BotManager] Bot for ${connectionId} is already initializing, waiting...`,
    );
    await new Promise((resolve) => setTimeout(resolve, 2000));
    return instance.client?.isReady() ?? false;
  }

  // Check if we have a saved config or authorization header
  const { getDiscordConfig } = await import("./lib/config-cache.ts");
  const savedConfig = await getDiscordConfig(connectionId).catch(() => null);

  const hasAuth = !!env.MESH_REQUEST_CONTEXT?.authorization;
  const hasSavedConfig = !!savedConfig?.botToken;

  if (!hasAuth && !hasSavedConfig) {
    console.log(
      `[BotManager] Bot not configured for ${connectionId}. Use DISCORD_SAVE_CONFIG or add token in Authorization header.`,
    );
    return false;
  }

  if (hasSavedConfig) {
    console.log(
      `[BotManager] Found saved configuration in Supabase for ${connectionId}`,
    );
  }

  // Start initialization for this connection
  instance.initializing = true;
  console.log(`[BotManager] Auto-starting Discord bot for ${connectionId}...`);

  try {
    setDatabaseEnv(env);
    console.log("[BotManager] Database ready");

    // Initialize Discord client for this connection
    await initializeDiscordClient(env);
    instance.initialized = true;
    console.log(`[BotManager] Discord bot started for ${connectionId} ✓`);

    return true;
  } catch (error) {
    console.error(
      `[BotManager] Failed to start bot for ${connectionId}:`,
      error,
    );
    return false;
  } finally {
    instance.initializing = false;
  }
}

/**
 * Check if bot is running for a given connection.
 */
export function isBotRunning(env: Env): boolean {
  const connectionId = getConnectionId(env);
  return getInstance(connectionId)?.client?.isReady() ?? false;
}

/**
 * Get bot status info for a given connection.
 */
export function getBotStatus(env: Env) {
  const connectionId = getConnectionId(env);
  const instance = getInstance(connectionId);

  if (!instance?.client || !instance.client.isReady()) {
    return {
      running: false,
      initializing: instance?.initializing ?? false,
    };
  }

  return {
    running: true,
    initializing: false,
    user: instance.client.user?.tag,
    guilds: instance.client.guilds.cache.size,
    uptime: instance.client.uptime,
  };
}

/**
 * Shutdown the bot for a specific connection.
 */
export async function shutdownBot(env: Env): Promise<void> {
  const connectionId = getConnectionId(env);
  await shutdownDiscordClient(connectionId);
  removeInstance(connectionId);
}

/**
 * Shutdown all bot instances (for graceful process shutdown).
 */
export async function shutdownAllBots(): Promise<void> {
  const instances = getAllInstances();
  console.log(`[BotManager] Shutting down ${instances.length} bot instance(s)`);
  for (const instance of instances) {
    try {
      await shutdownDiscordClient(instance.connectionId);
      removeInstance(instance.connectionId);
    } catch (error) {
      console.error(
        `[BotManager] Error shutting down ${instance.connectionId}:`,
        error,
      );
    }
  }
}
