/**
 * PostgreSQL Database Module using DATABASE binding
 *
 * Uses the @deco/postgres binding with DATABASES_RUN_SQL tool
 * instead of Kysely for better Mesh integration
 */

import type { Env } from "../types/env.ts";

/**
 * Run a SQL query using the DATABASE binding
 * @param env - The environment containing the DATABASE binding
 * @param sql - SQL query with ? placeholders
 * @param params - Parameters to substitute for ? placeholders
 * @returns The query results as an array of rows
 */
export async function runSQL<T = unknown>(
  env: Env,
  sql: string,
  params: unknown[] = [],
): Promise<T[]> {
  // Check if DATABASE binding is available
  const dbBinding = env.MESH_REQUEST_CONTEXT?.state?.DATABASE;

  if (!dbBinding) {
    throw new Error(
      "DATABASE binding is not available. Ensure the binding is configured in Mesh UI.",
    );
  }

  const response = await dbBinding.DATABASES_RUN_SQL({
    sql,
    params,
  });

  if (!response?.result?.[0]) {
    throw new Error("Invalid response from database binding");
  }

  return (response.result[0].results ?? []) as T[];
}

/**
 * Ensure the slack_connections table exists
 */
export async function ensureConnectionsTable(env: Env) {
  await runSQL(
    env,
    `
    CREATE TABLE IF NOT EXISTS slack_connections (
      connection_id TEXT PRIMARY KEY,
      organization_id TEXT NOT NULL,
      mesh_url TEXT NOT NULL,
      mesh_token TEXT,
      model_provider_id TEXT,
      model_id TEXT,
      agent_id TEXT,
      system_prompt TEXT,
      bot_token TEXT NOT NULL,
      signing_secret TEXT NOT NULL,
      team_id TEXT,
      bot_user_id TEXT,
      response_config JSONB,
      configured_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `,
  );

  // Add response_config column if it doesn't exist (migration for existing tables)
  try {
    await runSQL(
      env,
      `ALTER TABLE slack_connections ADD COLUMN IF NOT EXISTS response_config JSONB`,
    );
  } catch (error) {
    // Ignore errors (column may already exist, or PostgreSQL version may not support IF NOT EXISTS)
    console.log("[DB-SQL] ℹ️ response_config column may already exist");
  }

  // Create indexes
  await runSQL(
    env,
    `CREATE INDEX IF NOT EXISTS idx_slack_connections_org_id ON slack_connections(organization_id)`,
  );

  await runSQL(
    env,
    `CREATE INDEX IF NOT EXISTS idx_slack_connections_team_id ON slack_connections(team_id)`,
  );
}

export interface ConnectionConfig {
  connectionId: string;
  organizationId: string;
  meshUrl: string;
  meshToken?: string;
  modelProviderId?: string;
  modelId?: string;
  agentId?: string;
  systemPrompt?: string;
  botToken: string;
  signingSecret: string;
  teamId?: string;
  botUserId?: string;
  responseConfig?: {
    showOnlyFinalResponse?: boolean;
    enableStreaming?: boolean;
    showThinkingMessage?: boolean;
  };
  configuredAt?: string;
  updatedAt?: string;
}

/**
 * Save or update connection configuration
 */
export async function saveConnectionConfig(
  env: Env,
  config: ConnectionConfig,
): Promise<void> {
  const responseConfigJson = config.responseConfig
    ? JSON.stringify(config.responseConfig)
    : null;

  await runSQL(
    env,
    `
    INSERT INTO slack_connections (
      connection_id, organization_id, mesh_url, mesh_token,
      model_provider_id, model_id, agent_id, system_prompt,
      bot_token, signing_secret, team_id, bot_user_id,
      response_config,
      configured_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?::jsonb, NOW(), NOW())
    ON CONFLICT (connection_id) DO UPDATE SET
      organization_id = EXCLUDED.organization_id,
      mesh_url = EXCLUDED.mesh_url,
      mesh_token = EXCLUDED.mesh_token,
      model_provider_id = EXCLUDED.model_provider_id,
      model_id = EXCLUDED.model_id,
      agent_id = EXCLUDED.agent_id,
      system_prompt = EXCLUDED.system_prompt,
      bot_token = EXCLUDED.bot_token,
      signing_secret = EXCLUDED.signing_secret,
      team_id = EXCLUDED.team_id,
      bot_user_id = EXCLUDED.bot_user_id,
      response_config = EXCLUDED.response_config,
      updated_at = NOW()
  `,
    [
      config.connectionId,
      config.organizationId,
      config.meshUrl,
      config.meshToken || null,
      config.modelProviderId || null,
      config.modelId || null,
      config.agentId || null,
      config.systemPrompt || null,
      config.botToken,
      config.signingSecret,
      config.teamId || null,
      config.botUserId || null,
      responseConfigJson,
    ],
  );

  console.log(
    `[DB-SQL] 💾 Saved config for connection: ${config.connectionId}`,
  );
}

/**
 * Read connection configuration
 */
export async function readConnectionConfig(
  env: Env,
  connectionId: string,
): Promise<ConnectionConfig | null> {
  const results = await runSQL<{
    connection_id: string;
    organization_id: string;
    mesh_url: string;
    mesh_token: string | null;
    model_provider_id: string | null;
    model_id: string | null;
    agent_id: string | null;
    system_prompt: string | null;
    bot_token: string;
    signing_secret: string;
    team_id: string | null;
    bot_user_id: string | null;
    response_config: string | null;
    configured_at: string;
    updated_at: string;
  }>(
    env,
    `
    SELECT * FROM slack_connections WHERE connection_id = ?
  `,
    [connectionId],
  );

  if (results.length === 0) {
    return null;
  }

  const row = results[0];
  // PostgreSQL JSONB columns are returned as objects, no need to parse
  const responseConfig = row.response_config || undefined;

  return {
    connectionId: row.connection_id,
    organizationId: row.organization_id,
    meshUrl: row.mesh_url,
    meshToken: row.mesh_token || undefined,
    modelProviderId: row.model_provider_id || undefined,
    modelId: row.model_id || undefined,
    agentId: row.agent_id || undefined,
    systemPrompt: row.system_prompt || undefined,
    botToken: row.bot_token,
    signingSecret: row.signing_secret,
    teamId: row.team_id || undefined,
    botUserId: row.bot_user_id || undefined,
    responseConfig,
    configuredAt: row.configured_at,
    updatedAt: row.updated_at,
  };
}

/**
 * Update Slack team info for a connection
 */
export async function updateConnectionSlackInfo(
  env: Env,
  connectionId: string,
  teamId: string,
  botUserId: string,
): Promise<void> {
  await runSQL(
    env,
    `
    UPDATE slack_connections
    SET team_id = ?, bot_user_id = ?, updated_at = NOW()
    WHERE connection_id = ?
  `,
    [teamId, botUserId, connectionId],
  );

  console.log(
    `[DB-SQL] 🔄 Updated Slack info for ${connectionId}: team=${teamId}, bot=${botUserId}`,
  );
}

/**
 * List all connection configs for an organization
 */
export async function listConnectionConfigs(
  env: Env,
  organizationId: string,
): Promise<ConnectionConfig[]> {
  const results = await runSQL<{
    connection_id: string;
    organization_id: string;
    mesh_url: string;
    mesh_token: string | null;
    model_provider_id: string | null;
    model_id: string | null;
    agent_id: string | null;
    system_prompt: string | null;
    bot_token: string;
    signing_secret: string;
    team_id: string | null;
    bot_user_id: string | null;
    configured_at: string;
    updated_at: string;
  }>(
    env,
    `
    SELECT * FROM slack_connections WHERE organization_id = ? ORDER BY updated_at DESC
  `,
    [organizationId],
  );

  return results.map((row) => ({
    connectionId: row.connection_id,
    organizationId: row.organization_id,
    meshUrl: row.mesh_url,
    meshToken: row.mesh_token || undefined,
    modelProviderId: row.model_provider_id || undefined,
    modelId: row.model_id || undefined,
    agentId: row.agent_id || undefined,
    systemPrompt: row.system_prompt || undefined,
    botToken: row.bot_token,
    signingSecret: row.signing_secret,
    teamId: row.team_id || undefined,
    botUserId: row.bot_user_id || undefined,
    configuredAt: row.configured_at,
    updatedAt: row.updated_at,
  }));
}
