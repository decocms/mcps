/**
 * Data persistence for Slack MCP (Multi-tenant)
 *
 * Manages configurations linking Mesh connections to Slack workspaces.
 * Primary key: connectionId (from Mesh)
 */

import { getKvStore } from "./kv.ts";

// ============================================================================
// Connection-based config (primary - uses connectionId as key)
// ============================================================================

export interface SlackConnectionConfig {
  connectionId: string;
  organizationId: string;
  meshUrl: string;
  botToken: string;
  signingSecret: string;
  teamId?: string; // Optional, fetched from Slack API
  botUserId?: string;
  configuredAt: string;
}

const CONNECTION_CONFIG_PREFIX = "slack:connection:";

/**
 * Save connection configuration (called when Mesh sends config)
 */
export async function saveConnectionConfig(
  connectionId: string,
  config: Omit<SlackConnectionConfig, "connectionId" | "configuredAt">,
): Promise<void> {
  const kv = getKvStore();
  const fullConfig: SlackConnectionConfig = {
    ...config,
    connectionId,
    configuredAt: new Date().toISOString(),
  };
  await kv.set(`${CONNECTION_CONFIG_PREFIX}${connectionId}`, fullConfig);
  console.log(`[Data] Saved config for connection: ${connectionId}`);
}

/**
 * Read connection configuration by connectionId
 */
export async function readConnectionConfig(
  connectionId: string,
): Promise<SlackConnectionConfig | null> {
  const kv = getKvStore();
  const config = await kv.get<SlackConnectionConfig>(
    `${CONNECTION_CONFIG_PREFIX}${connectionId}`,
  );
  return config ?? null;
}

/**
 * Update connection config with Slack API data (teamId, botUserId)
 */
export async function updateConnectionSlackInfo(
  connectionId: string,
  slackInfo: { teamId?: string; botUserId?: string },
): Promise<void> {
  const config = await readConnectionConfig(connectionId);
  if (config) {
    if (slackInfo.teamId) config.teamId = slackInfo.teamId;
    if (slackInfo.botUserId) config.botUserId = slackInfo.botUserId;
    const kv = getKvStore();
    await kv.set(`${CONNECTION_CONFIG_PREFIX}${connectionId}`, config);
    console.log(`[Data] Updated Slack info for connection: ${connectionId}`);
  }
}

/**
 * List all configured connections
 */
export async function listConnectionConfigs(): Promise<
  SlackConnectionConfig[]
> {
  const kv = getKvStore();
  const keys = await kv.keys(CONNECTION_CONFIG_PREFIX);
  const configs: SlackConnectionConfig[] = [];

  for (const key of keys) {
    const config = await kv.get<SlackConnectionConfig>(key);
    if (config) {
      configs.push(config);
    }
  }

  return configs;
}

// ============================================================================
// Legacy team-based config (kept for backwards compatibility)
// ============================================================================

export interface SlackTeamConfig {
  teamId: string;
  organizationId: string;
  meshUrl: string;
  botToken: string;
  signingSecret: string;
  botUserId?: string;
  configuredAt: string;
}

const TEAM_CONFIG_PREFIX = "slack:team:";

/**
 * Save team configuration (called when Mesh sends config)
 */
export async function saveTeamConfig(
  teamId: string,
  config: Omit<SlackTeamConfig, "teamId" | "configuredAt">,
): Promise<void> {
  const kv = getKvStore();
  const fullConfig: SlackTeamConfig = {
    ...config,
    teamId,
    configuredAt: new Date().toISOString(),
  };
  await kv.set(`${TEAM_CONFIG_PREFIX}${teamId}`, fullConfig);
  console.log(`[Data] Saved config for team: ${teamId}`);
}

/**
 * Read team configuration by teamId
 */
export async function readTeamConfig(
  teamId: string,
): Promise<SlackTeamConfig | null> {
  const kv = getKvStore();
  const config = await kv.get<SlackTeamConfig>(
    `${TEAM_CONFIG_PREFIX}${teamId}`,
  );
  return config ?? null;
}

/**
 * Delete team configuration
 */
export async function deleteTeamConfig(teamId: string): Promise<boolean> {
  const kv = getKvStore();
  return await kv.delete(`${TEAM_CONFIG_PREFIX}${teamId}`);
}

/**
 * List all configured teams
 */
export async function listTeamConfigs(): Promise<SlackTeamConfig[]> {
  const kv = getKvStore();
  const keys = await kv.keys(TEAM_CONFIG_PREFIX);
  const configs: SlackTeamConfig[] = [];

  for (const key of keys) {
    const config = await kv.get<SlackTeamConfig>(key);
    if (config) {
      configs.push(config);
    }
  }

  return configs;
}

/**
 * Update bot user ID for a team (called after auth.test)
 */
export async function updateTeamBotUserId(
  teamId: string,
  botUserId: string,
): Promise<void> {
  const config = await readTeamConfig(teamId);
  if (config) {
    config.botUserId = botUserId;
    const kv = getKvStore();
    await kv.set(`${TEAM_CONFIG_PREFIX}${teamId}`, config);
    console.log(`[Data] Updated botUserId for team: ${teamId}`);
  }
}
