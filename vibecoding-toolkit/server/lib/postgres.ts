/**
 * PostgreSQL Table Management
 *
 * This module handles automatic table creation for the agents collection
 * using the @deco/postgres MCP binding.
 */

import type { Env } from "../main.ts";

/**
 * Ensure the agents table exists, creating it if necessary
 */
export async function ensureAgentsTable(env: Env) {
  try {
    // Create the agents table
    await env.POSTGRES.RUN_SQL({
      query: `
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
      `,
      params: [],
    });

    // Create indexes for better query performance
    await env.POSTGRES.RUN_SQL({
      query: `
        CREATE INDEX IF NOT EXISTS idx_agents_created_at ON agents(created_at DESC)
      `,
      params: [],
    });

    await env.POSTGRES.RUN_SQL({
      query: `
        CREATE INDEX IF NOT EXISTS idx_agents_updated_at ON agents(updated_at DESC)
      `,
      params: [],
    });

    await env.POSTGRES.RUN_SQL({
      query: `CREATE INDEX IF NOT EXISTS idx_agents_title ON agents(title)`,
      params: [],
    });
  } catch (error) {
    console.error("Error ensuring agents table exists:", error);
    throw error;
  }
}
