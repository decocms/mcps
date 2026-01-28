/**
 * Slack Connections Migration
 *
 * Creates the slack_connections table for storing Slack workspace configurations.
 * This replaces the KV store for connection configs to support multi-pod K8s deployments.
 *
 * Each connection represents a Mesh connection linked to a Slack workspace.
 */

import { Kysely, sql } from "kysely";

export async function up(db: Kysely<unknown>): Promise<void> {
  await db.schema
    .createTable("slack_connections")
    .addColumn("connection_id", "text", (col) => col.primaryKey())
    .addColumn("organization_id", "text", (col) => col.notNull())
    .addColumn("mesh_url", "text", (col) => col.notNull())
    .addColumn("mesh_token", "text") // Persistent API Key
    .addColumn("model_provider_id", "text") // AI Model Provider
    .addColumn("model_id", "text") // Specific model ID
    .addColumn("agent_id", "text") // Agent/Virtual MCP ID
    .addColumn("system_prompt", "text") // Agent's system prompt
    .addColumn("bot_token", "text", (col) => col.notNull()) // Slack Bot Token (xoxb-*)
    .addColumn("signing_secret", "text", (col) => col.notNull()) // Slack Signing Secret
    .addColumn("team_id", "text") // Slack Workspace ID
    .addColumn("bot_user_id", "text") // Slack Bot User ID
    .addColumn("configured_at", "text", (col) =>
      col.notNull().defaultTo(sql`CURRENT_TIMESTAMP`),
    )
    .addColumn("updated_at", "text", (col) =>
      col.notNull().defaultTo(sql`CURRENT_TIMESTAMP`),
    )
    .execute();

  // Index for fast lookup by team_id (for webhooks that use team_id)
  await db.schema
    .createIndex("idx_slack_connections_team_id")
    .on("slack_connections")
    .column("team_id")
    .execute();

  // Index for updated_at (for cleanup queries)
  await db.schema
    .createIndex("idx_slack_connections_updated_at")
    .on("slack_connections")
    .columns(["updated_at"])
    .execute();

  // Index for organization_id (for multi-tenant queries)
  await db.schema
    .createIndex("idx_slack_connections_organization_id")
    .on("slack_connections")
    .column("organization_id")
    .execute();
}

export async function down(db: Kysely<unknown>): Promise<void> {
  await db.schema.dropTable("slack_connections").execute();
}
