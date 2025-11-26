/**
 * PostgreSQL Connection Module
 *
 * This module provides PostgreSQL connectivity using postgres.js
 * and handles automatic table creation for the agents collection.
 */

import postgres from "postgres";
import type { Env } from "../main.ts";

// Cache connections per connection string to avoid creating multiple connections
const connectionCache = new Map<string, ReturnType<typeof postgres>>();

/**
 * Get a PostgreSQL connection using the connection string from app state
 */
export function getPostgres(env: Env) {
  const connectionString =
    env.DECO_REQUEST_CONTEXT.state.postgresConnectionString;

  if (!connectionString) {
    throw new Error(
      "PostgreSQL connection string not configured. Please add it to your app state.",
    );
  }

  // Return cached connection if available
  if (connectionCache.has(connectionString)) {
    return connectionCache.get(connectionString)!;
  }

  // Create new connection
  const sql = postgres(connectionString, {
    // Connection pool settings
    max: 10,
    idle_timeout: 20,
    connect_timeout: 10,
  });

  connectionCache.set(connectionString, sql);

  return sql;
}

/**
 * Ensure the agents table exists, creating it if necessary
 */
export async function ensureAgentsTable(env: Env) {
  const sql = getPostgres(env);

  try {
    await sql`
      CREATE TABLE IF NOT EXISTS agents (
        id TEXT PRIMARY KEY,
        title TEXT NOT NULL,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        created_by TEXT,
        updated_by TEXT,
        description TEXT NOT NULL,
        instructions TEXT NOT NULL,
        tool_set JSONB NOT NULL DEFAULT '{}'::jsonb
      )
    `;

    // Create indexes for better query performance
    await sql`
      CREATE INDEX IF NOT EXISTS idx_agents_created_at ON agents(created_at DESC)
    `;

    await sql`
      CREATE INDEX IF NOT EXISTS idx_agents_updated_at ON agents(updated_at DESC)
    `;

    await sql`
      CREATE INDEX IF NOT EXISTS idx_agents_title ON agents(title)
    `;
  } catch (error) {
    console.error("Error ensuring agents table exists:", error);
    throw error;
  }
}
