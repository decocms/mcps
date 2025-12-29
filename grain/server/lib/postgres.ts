/**
 * PostgreSQL Database Module
 *
 * This module provides PostgreSQL connectivity using the DATABASE binding
 * and handles automatic table creation for grain recordings.
 */

import type { Env } from "../main.ts";

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
 * Ensure the grain_recordings table exists, creating it if necessary
 */
export async function ensureRecordingsTable(env: Env) {
  try {
    await runSQL(
      env,
      `
			CREATE TABLE IF NOT EXISTS grain_recordings (
				id TEXT PRIMARY KEY,
				connection_id TEXT NOT NULL,
				title TEXT NOT NULL,
				duration_seconds INTEGER,
				recorded_at TIMESTAMPTZ,
				status TEXT,
				participants_count INTEGER,
				transcript_available BOOLEAN DEFAULT FALSE,
				raw_data JSONB,
				created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
				updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
			)
		`,
    );

    // Create indexes for better query performance
    await runSQL(
      env,
      `CREATE INDEX IF NOT EXISTS idx_grain_recordings_connection_id ON grain_recordings(connection_id)`,
    );

    await runSQL(
      env,
      `CREATE INDEX IF NOT EXISTS idx_grain_recordings_recorded_at ON grain_recordings(recorded_at DESC)`,
    );

    await runSQL(
      env,
      `CREATE INDEX IF NOT EXISTS idx_grain_recordings_status ON grain_recordings(status)`,
    );

    await runSQL(
      env,
      `CREATE INDEX IF NOT EXISTS idx_grain_recordings_created_at ON grain_recordings(created_at DESC)`,
    );
  } catch (error) {
    console.error("Error ensuring grain_recordings table exists:", error);
    throw error;
  }
}
