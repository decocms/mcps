/**
 * Bot lifecycle manager. Tools and `onChange` call into here to start/stop bots
 * for a given connection.
 */

import type { Env } from "../types/env.ts";
import { initializeGateway, shutdownGateway } from "./gateway.ts";
import {
  getInstance,
  getOrCreateInstance,
  getAllInstances,
  removeInstance,
} from "./instance.ts";
import { getDiscordConfig } from "../lib/config-cache.ts";

function getConnectionId(env: Env): string {
  return env.MESH_REQUEST_CONTEXT?.connectionId || "default-connection";
}

export function updateEnv(env: Env): void {
  const connectionId = getConnectionId(env);
  const instance = getOrCreateInstance(connectionId, env);
  instance.env = env;
}

export function getCurrentEnv(connectionId?: string): Env | null {
  if (!connectionId) return null;
  return getInstance(connectionId)?.env ?? null;
}

export async function ensureBotRunning(env: Env): Promise<boolean> {
  const connectionId = getConnectionId(env);
  const instance = getOrCreateInstance(connectionId, env);

  instance.env = env;

  if (instance.client?.isReady()) return true;

  if (instance.initializing) {
    await new Promise((resolve) => setTimeout(resolve, 2000));
    return instance.client?.isReady() ?? false;
  }

  let savedConfig;
  try {
    savedConfig = await getDiscordConfig(connectionId);
  } catch {
    savedConfig = null;
  }

  const hasAuth = !!env.MESH_REQUEST_CONTEXT?.authorization;
  const hasSavedConfig = !!savedConfig?.botToken;

  if (!hasAuth && !hasSavedConfig) return false;

  instance.initializing = true;

  try {
    await initializeGateway(env);
    instance.initialized = true;
    return true;
  } catch {
    return false;
  } finally {
    instance.initializing = false;
  }
}

export function isBotRunning(env: Env): boolean {
  const connectionId = getConnectionId(env);
  return getInstance(connectionId)?.client?.isReady() ?? false;
}

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
    ping: instance.client.ws.ping,
  };
}

export async function shutdownBot(env: Env): Promise<void> {
  const connectionId = getConnectionId(env);
  await shutdownGateway(connectionId);
  removeInstance(connectionId);
}

export async function shutdownAllBots(): Promise<void> {
  const list = getAllInstances();
  for (const instance of list) {
    try {
      await shutdownGateway(instance.connectionId);
      removeInstance(instance.connectionId);
    } catch {
      // swallow per-instance errors so others can shut down
    }
  }
}
