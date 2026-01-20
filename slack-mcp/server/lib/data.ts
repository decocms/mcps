/**
 * Data persistence for Slack MCP (Multi-tenant)
 *
 * Manages team configurations linking Slack workspaces to Mesh organizations.
 */

import { getKvStore } from "./kv.ts";

export interface SlackTeamConfig {
  teamId: string;
  organizationId: string;
  meshUrl: string;
  botToken: string;
  signingSecret: string;
  appToken?: string;
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
