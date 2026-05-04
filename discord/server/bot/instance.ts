/**
 * Bot instance registry — keyed by Mesh connectionId.
 *
 * Each tenant (Mesh connection) gets its own BotInstance: a discord.js Client
 * + the env that came in via onChange. Instances sharing a bot_token share a
 * single Client (deduped at bootstrap).
 */

import type { Client } from "discord.js";
import type { Env } from "../types/env.ts";

export interface BotInstance {
  connectionId: string;
  client: Client | null;
  env: Env;
  initializing: boolean;
  initialized: boolean;
  initializingPromise: Promise<Client> | null;
}

const instances = new Map<string, BotInstance>();

export function getInstance(connectionId: string): BotInstance | undefined {
  return instances.get(connectionId);
}

export function getOrCreateInstance(
  connectionId: string,
  env: Env,
): BotInstance {
  let instance = instances.get(connectionId);
  if (!instance) {
    instance = {
      connectionId,
      client: null,
      env,
      initializing: false,
      initialized: false,
      initializingPromise: null,
    };
    instances.set(connectionId, instance);
  }
  return instance;
}

export function removeInstance(connectionId: string): void {
  instances.delete(connectionId);
}

export function getAllInstances(): BotInstance[] {
  return Array.from(instances.values());
}

export function getInstanceByClient(client: Client): BotInstance | undefined {
  for (const instance of instances.values()) {
    if (instance.client === client) return instance;
  }
  return undefined;
}
