/**
 * PostgreSQL Database Module for Grain MCP
 *
 * Handles indexing of Grain recordings received via webhooks
 * Note: DATABASE binding is only available in production (via Mesh)
 */

import type { Env } from "../types/env.ts";
import type { WebhookPayload } from "./types.ts";

/**
 * Run a SQL query using the DATABASE binding
 * @param env - The environment containing the DATABASE binding
 * @param sql - SQL query with ? placeholders
 * @param params - Parameters to substitute for ? placeholders (properly parameterized by DATABASES_RUN_SQL)
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
      "DATABASE binding is not available. Ensure the binding is configured in app.json and scopes are requested.",
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
 * Ensure the grain_recordings table exists, creating it if necessary
 */
export async function ensureRecordingsTable(env: Env) {
  try {
    await runSQL(
      env,
      `
      CREATE TABLE IF NOT EXISTS grain_recordings (
        id TEXT PRIMARY KEY,
        title TEXT NOT NULL,
        source TEXT NOT NULL,
        url TEXT NOT NULL,
        media_type TEXT,
        start_datetime TIMESTAMPTZ NOT NULL,
        end_datetime TIMESTAMPTZ NOT NULL,
        duration_ms INTEGER NOT NULL,
        thumbnail_url TEXT,
        tags JSONB DEFAULT '[]'::jsonb,
        teams JSONB DEFAULT '[]'::jsonb,
        meeting_type JSONB,
        user_id TEXT NOT NULL,
        webhook_type TEXT NOT NULL,
        raw_payload JSONB NOT NULL,
        indexed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `,
    );

    // Create indexes for better query performance
    await runSQL(
      env,
      `CREATE INDEX IF NOT EXISTS idx_grain_recordings_start_datetime ON grain_recordings(start_datetime DESC)`,
    );

    await runSQL(
      env,
      `CREATE INDEX IF NOT EXISTS idx_grain_recordings_source ON grain_recordings(source)`,
    );

    await runSQL(
      env,
      `CREATE INDEX IF NOT EXISTS idx_grain_recordings_user_id ON grain_recordings(user_id)`,
    );

    await runSQL(
      env,
      `CREATE INDEX IF NOT EXISTS idx_grain_recordings_title ON grain_recordings USING gin(to_tsvector('english', title))`,
    );

    console.log("Grain recordings table ensured");
  } catch (error) {
    console.error("Error ensuring grain_recordings table:", error);
    throw error;
  }
}

/**
 * Index a recording from a webhook payload
 * Inserts or updates the recording in the database
 */
export async function indexRecording(
  env: Env,
  payload: WebhookPayload,
): Promise<void> {
  try {
    const { data, user_id, type } = payload;

    // Upsert the recording (insert or update if exists)
    await runSQL(
      env,
      `
      INSERT INTO grain_recordings (
        id, title, source, url, media_type,
        start_datetime, end_datetime, duration_ms,
        thumbnail_url, tags, teams, meeting_type,
        user_id, webhook_type, raw_payload,
        indexed_at, updated_at
      ) VALUES (
        ?, ?, ?, ?, ?,
        ?, ?, ?,
        ?, ?::jsonb, ?::jsonb, ?::jsonb,
        ?, ?, ?::jsonb,
        NOW(), NOW()
      )
      ON CONFLICT (id) DO UPDATE SET
        title = EXCLUDED.title,
        url = EXCLUDED.url,
        thumbnail_url = EXCLUDED.thumbnail_url,
        tags = EXCLUDED.tags,
        teams = EXCLUDED.teams,
        meeting_type = EXCLUDED.meeting_type,
        raw_payload = EXCLUDED.raw_payload,
        updated_at = NOW()
    `,
      [
        data.id,
        data.title,
        data.source,
        data.url,
        data.media_type || "video",
        data.start_datetime,
        data.end_datetime,
        data.duration_ms,
        data.thumbnail_url || null,
        JSON.stringify(data.tags || []),
        JSON.stringify(data.teams || []),
        JSON.stringify(data.meeting_type || null),
        user_id,
        type,
        JSON.stringify(payload),
      ],
    );

    console.log(`Indexed recording: ${data.id} - ${data.title}`);
  } catch (error) {
    console.error("Error indexing recording:", error);
    throw error;
  }
}

/**
 * Search recordings by title or content
 */
export async function searchRecordings(
  env: Env,
  query: string,
  limit = 10,
): Promise<unknown[]> {
  return await runSQL(
    env,
    `
    SELECT 
      id, title, source, url, media_type,
      start_datetime, end_datetime, duration_ms,
      thumbnail_url, tags, teams, meeting_type,
      indexed_at
    FROM grain_recordings
    WHERE to_tsvector('english', title) @@ plainto_tsquery('english', ?)
    ORDER BY start_datetime DESC
    LIMIT ?
  `,
    [query, limit],
  );
}

/**
 * Get recordings by date range
 */
export async function getRecordingsByDateRange(
  env: Env,
  startDate: string,
  endDate: string,
): Promise<unknown[]> {
  return await runSQL(
    env,
    `
    SELECT 
      id, title, source, url, media_type,
      start_datetime, end_datetime, duration_ms,
      thumbnail_url, tags, teams, meeting_type,
      indexed_at
    FROM grain_recordings
    WHERE start_datetime >= ? AND start_datetime <= ?
    ORDER BY start_datetime DESC
  `,
    [startDate, endDate],
  );
}
