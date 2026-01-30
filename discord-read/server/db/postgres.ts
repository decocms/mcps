/**
 * PostgreSQL Database Module
 *
 * Generic SQL runner using Supabase Client only.
 */

import type { Env } from "../types/env.ts";
import {
  isSupabaseConfigured,
  runSQL as supabaseRunSQL,
} from "./supabase-client.ts";

/**
 * Run a SQL query using Supabase
 * @param _env - The environment (not used, kept for compatibility)
 * @param sql - SQL query with ? or $1 placeholders
 * @param params - Parameters to substitute for placeholders
 * @returns The query results as an array of rows
 */
export async function runSQL<T = unknown>(
  _env: Env,
  sql: string,
  params: unknown[] = [],
): Promise<T[]> {
  if (!isSupabaseConfigured()) {
    throw new Error(
      "[Database] Supabase not configured. Set SUPABASE_URL + SUPABASE_ANON_KEY environment variables.",
    );
  }

  // Convert ? placeholders to $1, $2, etc for PostgreSQL
  let sqlWithDollarPlaceholders = sql;
  let paramIndex = 1;
  while (sqlWithDollarPlaceholders.includes("?")) {
    sqlWithDollarPlaceholders = sqlWithDollarPlaceholders.replace(
      "?",
      `$${paramIndex++}`,
    );
  }

  return await supabaseRunSQL<T>(sqlWithDollarPlaceholders, params);
}

/**
 * Run multiple SQL statements in sequence
 * @param env - The environment containing the DATABASE binding (fallback)
 * @param statements - Array of SQL statements to execute
 */
export async function runSQLStatements(
  env: Env,
  statements: string[],
): Promise<void> {
  for (const sql of statements) {
    if (sql.trim()) {
      await runSQL(env, sql);
    }
  }
}
