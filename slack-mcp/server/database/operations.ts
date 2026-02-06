/**
 * Database Operations for Slack Connections
 *
 * CRUD operations for slack_connections table.
 * Works with both PostgreSQL (Supabase/production) and SQLite (development).
 */

import { getDb, type SlackConnectionRow } from "./index.ts";
import type { ConnectionConfig } from "../lib/config-cache.ts";

/**
 * Save or update connection configuration in database
 */
export async function saveConnectionConfig(
  config: ConnectionConfig,
): Promise<void> {
  const db = getDb(process.env.DATABASE_URL);

  const now = new Date().toISOString();

  // Check if connection already exists
  const existing = await db.db
    .selectFrom("slack_connections")
    .where("connection_id", "=", config.connectionId)
    .selectAll()
    .executeTakeFirst();

  const row: Partial<SlackConnectionRow> = {
    connection_id: config.connectionId,
    organization_id: config.organizationId,
    mesh_url: config.meshUrl,
    mesh_token: config.meshToken || null,
    model_provider_id: config.modelProviderId || null,
    model_id: config.modelId || null,
    agent_id: config.agentId || null,
    system_prompt: config.systemPrompt || null,
    bot_token: config.botToken,
    signing_secret: config.signingSecret,
    team_id: config.teamId || null,
    bot_user_id: config.botUserId || null,
    updated_at: now,
  };

  if (existing) {
    // Update existing connection
    await db.db
      .updateTable("slack_connections")
      .set(row)
      .where("connection_id", "=", config.connectionId)
      .execute();

    console.log(
      `[Database] 💾 Updated connection config: ${config.connectionId}`,
    );
  } else {
    // Insert new connection
    await db.db
      .insertInto("slack_connections")
      .values({
        ...row,
        configured_at: now,
      } as SlackConnectionRow)
      .execute();

    console.log(
      `[Database] 💾 Inserted new connection config: ${config.connectionId}`,
    );
  }
}

/**
 * Load connection configuration from database
 */
export async function loadConnectionConfig(
  connectionId: string,
): Promise<ConnectionConfig | null> {
  const db = getDb(process.env.DATABASE_URL);

  const row = await db.db
    .selectFrom("slack_connections")
    .where("connection_id", "=", connectionId)
    .selectAll()
    .executeTakeFirst();

  if (!row) {
    return null;
  }

  // Convert database row to ConnectionConfig format
  const config: ConnectionConfig = {
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
    // Note: Additional fields from ConnectionConfig (responseConfig, etc.)
    // are not stored in database yet - could be added to migration if needed
  };

  return config;
}

/**
 * Load all connection configurations from database
 */
export async function loadAllConnectionConfigs(): Promise<ConnectionConfig[]> {
  const db = getDb(process.env.DATABASE_URL);

  const rows = await db.db
    .selectFrom("slack_connections")
    .selectAll()
    .execute();

  return rows.map((row) => ({
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

/**
 * Delete connection configuration from database
 */
export async function deleteConnectionConfig(
  connectionId: string,
): Promise<void> {
  const db = getDb(process.env.DATABASE_URL);

  await db.db
    .deleteFrom("slack_connections")
    .where("connection_id", "=", connectionId)
    .execute();

  console.log(`[Database] 🗑️ Deleted connection config: ${connectionId}`);
}

/**
 * Count total connections in database
 */
export async function countConnections(): Promise<number> {
  const db = getDb(process.env.DATABASE_URL);

  const result = await db.db
    .selectFrom("slack_connections")
    .select((eb) => eb.fn.count("connection_id").as("count"))
    .executeTakeFirst();

  return Number(result?.count || 0);
}

/**
 * Load connection by team_id (for webhook routing)
 */
export async function loadConnectionByTeamId(
  teamId: string,
): Promise<ConnectionConfig | null> {
  const db = getDb(process.env.DATABASE_URL);

  const row = await db.db
    .selectFrom("slack_connections")
    .where("team_id", "=", teamId)
    .selectAll()
    .executeTakeFirst();

  if (!row) {
    return null;
  }

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
    configuredAt: row.configured_at,
    updatedAt: row.updated_at,
  };
}
