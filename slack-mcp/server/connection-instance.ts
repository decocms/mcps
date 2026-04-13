/**
 * Connection Instance Registry
 *
 * Holds per-connection state for multi-tenant Slack bot management.
 * Each Mesh connectionId gets its own env (with resolved AgentOf() binding).
 */

import type { Env } from "./types/env.ts";

export interface SlackConnectionInstance {
  connectionId: string;
  env: Env;
  botUserId?: string;
}

const instances = new Map<string, SlackConnectionInstance>();

export function getInstance(
  connectionId: string,
): SlackConnectionInstance | undefined {
  return instances.get(connectionId);
}

export function getOrCreateInstance(
  connectionId: string,
  env: Env,
): SlackConnectionInstance {
  let instance = instances.get(connectionId);
  if (!instance) {
    instance = { connectionId, env };
    instances.set(connectionId, instance);
  }
  return instance;
}

export function removeInstance(connectionId: string): void {
  instances.delete(connectionId);
}

export function getAllInstances(): SlackConnectionInstance[] {
  return Array.from(instances.values());
}
