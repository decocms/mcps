/**
 * PostgreSQL Database Module
 *
 * This module provides PostgreSQL connectivity using the DATABASE binding
 * and handles automatic table creation for the agents collection.
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
  const response = await env.DATABASE.DATABASES_RUN_SQL({
    sql,
    params,
  });
  return (response.result[0]?.results ?? []) as T[];
}

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
