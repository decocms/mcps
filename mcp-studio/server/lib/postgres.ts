/**
 * PostgreSQL Database Module
 *
 * This module provides PostgreSQL connectivity using the DATABASE binding
 * and handles automatic table creation for the assistants collection.
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
  // Defensive: some DATABASE bindings may interpolate params into SQL literals.
  // Ensure single quotes inside string params don't break the query.
  const sanitizedParams = params.map((p) => {
    if (typeof p === "string") return p.replaceAll("'", "''");
    return p;
  });
  const response =
    await env.MESH_REQUEST_CONTEXT.state.DATABASE.DATABASES_RUN_SQL({
      sql,
      params: sanitizedParams,
    });
  return (response.result[0]?.results ?? []) as T[];
}

/**
 * Ensure the assistants table exists, creating it if necessary
 */
export async function ensureAssistantsTable(env: Env) {
  try {
    await runSQL(
      env,
      `
			CREATE TABLE IF NOT EXISTS assistants (
				id TEXT PRIMARY KEY,
				title TEXT NOT NULL,
				created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
				updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
				created_by TEXT,
				updated_by TEXT,
				description TEXT NOT NULL,
				instructions TEXT NOT NULL,
				tool_set JSONB NOT NULL DEFAULT '{}',
				avatar TEXT NOT NULL DEFAULT '',
        system_prompt TEXT NOT NULL DEFAULT '',
        gateway_id TEXT NOT NULL DEFAULT '',
        model JSONB NOT NULL DEFAULT '{"id":"","connectionId":""}'::jsonb
			)
		`,
    );

    // Add avatar column if it doesn't exist (migration for existing tables)
    await runSQL(
      env,
      `ALTER TABLE assistants ADD COLUMN IF NOT EXISTS avatar TEXT NOT NULL DEFAULT ''`,
    );

    // Migrations for new AssistantSchema required fields
    await runSQL(
      env,
      `ALTER TABLE assistants ADD COLUMN IF NOT EXISTS system_prompt TEXT NOT NULL DEFAULT ''`,
    );
    await runSQL(
      env,
      `ALTER TABLE assistants ADD COLUMN IF NOT EXISTS gateway_id TEXT NOT NULL DEFAULT ''`,
    );
    await runSQL(
      env,
      `ALTER TABLE assistants ADD COLUMN IF NOT EXISTS model JSONB NOT NULL DEFAULT '{"id":"","connectionId":""}'::jsonb`,
    );

    // Ensure defaults match current AssistantSchema expectations even if columns already existed
    await runSQL(
      env,
      `ALTER TABLE assistants ALTER COLUMN gateway_id SET DEFAULT ''`,
    );
    await runSQL(
      env,
      `ALTER TABLE assistants ALTER COLUMN model SET DEFAULT '{"id":"","connectionId":""}'::jsonb`,
    );

    // Create indexes for better query performance
    await runSQL(
      env,
      `CREATE INDEX IF NOT EXISTS idx_assistants_created_at ON assistants(created_at DESC)`,
    );

    await runSQL(
      env,
      `CREATE INDEX IF NOT EXISTS idx_assistants_updated_at ON assistants(updated_at DESC)`,
    );

    await runSQL(
      env,
      `CREATE INDEX IF NOT EXISTS idx_assistants_title ON assistants(title)`,
    );
  } catch (error) {
    console.error("Error ensuring assistants table exists:", error);
    throw error;
  }
}

/**
 * Ensure the prompts table exists, creating it if necessary
 */
export async function ensurePromptsTable(env: Env) {
  try {
    await runSQL(
      env,
      `
      CREATE TABLE IF NOT EXISTS prompts (
        id TEXT PRIMARY KEY,
        title TEXT NOT NULL,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        created_by TEXT,
        updated_by TEXT,
        description TEXT,
        arguments JSONB NOT NULL DEFAULT '[]',
        icons JSONB NOT NULL DEFAULT '[]',
        messages JSONB NOT NULL DEFAULT '[]'
      )
    `,
    );

    // Create indexes for better query performance
    await runSQL(
      env,
      `CREATE INDEX IF NOT EXISTS idx_prompts_created_at ON prompts(created_at DESC)`,
    );

    await runSQL(
      env,
      `CREATE INDEX IF NOT EXISTS idx_prompts_updated_at ON prompts(updated_at DESC)`,
    );

    await runSQL(
      env,
      `CREATE INDEX IF NOT EXISTS idx_prompts_title ON prompts(title)`,
    );
  } catch (error) {
    console.error("Error ensuring prompts table exists:", error);
    throw error;
  }
}
