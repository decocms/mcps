/**
 * Agents Table Schema
 *
 * Table creation queries for the agents collection.
 */

import { runSQL } from "../postgres.ts";
import type { Env } from "../../types/env.ts";

/**
 * Ensure the agents table exists, creating it if necessary
 */
export async function ensureAgentsTable(env: Env) {
  try {
    await runSQL(
      env,
      `
			CREATE TABLE IF NOT EXISTS agents (
				id TEXT PRIMARY KEY,
				title TEXT NOT NULL,
				created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
				updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
				created_by TEXT,
				updated_by TEXT,
				description TEXT NOT NULL,
				instructions TEXT NOT NULL,
				tool_set JSONB NOT NULL DEFAULT '{}',
				avatar TEXT NOT NULL DEFAULT ''
			)
		`,
    );

    // Add avatar column if it doesn't exist (migration for existing tables)
    await runSQL(
      env,
      `ALTER TABLE agents ADD COLUMN IF NOT EXISTS avatar TEXT NOT NULL DEFAULT ''`,
    );

    // Create indexes for better query performance
    await runSQL(
      env,
      `CREATE INDEX IF NOT EXISTS idx_agents_created_at ON agents(created_at DESC)`,
    );

    await runSQL(
      env,
      `CREATE INDEX IF NOT EXISTS idx_agents_updated_at ON agents(updated_at DESC)`,
    );

    await runSQL(
      env,
      `CREATE INDEX IF NOT EXISTS idx_agents_title ON agents(title)`,
    );
  } catch (error) {
    console.error("Error ensuring agents table exists:", error);
    throw error;
  }
}
