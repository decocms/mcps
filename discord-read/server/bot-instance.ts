/**
 * Bot Instance Registry
 *
 * Holds per-connection state for multi-tenant Discord bot management.
 * Each Mesh connectionId gets its own Client, env, and caches.
 */

import type { Client } from "discord.js";
import type { Env } from "./types/env.ts";
import type { WhisperConfig } from "@decocms/mcps-shared/mesh-chat";

export interface CachedChannelContext {
  prompt: string;
  timestamp: number;
}

export interface AutoRespondCacheEntry {
  autoRespond: boolean;
  timestamp: number;
}

export interface BotInstance {
  connectionId: string;
  client: Client | null;
  env: Env;
  initializing: boolean;
  initialized: boolean;
  initializingPromise: Promise<Client> | null;
  // Per-instance caches
  autoRespondCache: Map<string, AutoRespondCacheEntry>;
  processedMessageIds: Set<string>;
  processedMessages: Set<string>;
  channelContextCache: Map<string, CachedChannelContext>;
  superAdmins: string[];
  whisperConfig: WhisperConfig | null;
  // Stable agent identifier extracted from the raw config.state.AGENT
  // metadata (`{__type, value}`). After Mesh fires onChange the runtime
  // env exposes state.AGENT as a Proxy that only carries .STREAM — the
  // underlying `value` (= the Mesh agent id) is no longer reachable.
  // Stash it here so llm.ts can still feed agent_id to ensureMeshThread
  // and to the direct-HTTP fallback.
  agentId?: string;
}

// The registry — keyed by connectionId
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
      autoRespondCache: new Map(),
      processedMessageIds: new Map() as unknown as Set<string>,
      processedMessages: new Set(),
      channelContextCache: new Map(),
      superAdmins: [],
      whisperConfig: null,
    };
    // Fix: use a real Set
    instance.processedMessageIds = new Set();
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

/**
 * Find the BotInstance that owns a given Client.
 * Used in event handlers where we have the client reference but not connectionId.
 */
export function getInstanceByClient(client: Client): BotInstance | undefined {
  for (const instance of instances.values()) {
    if (instance.client === client) {
      return instance;
    }
  }
  return undefined;
}
