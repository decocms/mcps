/**
 * PostgreSQL Database Module
 *
 * Generic SQL runner using Supabase Client or DATABASE binding (fallback).
 * Priority: Supabase > DATABASE binding
 */

import type { Env } from "../types/env.ts";
import {
  isSupabaseConfigured,
  runSQL as supabaseRunSQL,
} from "./supabase-client.ts";

/**
 * Run a SQL query using Supabase or DATABASE binding
 * @param env - The environment containing the DATABASE binding (used as fallback)
 * @param sql - SQL query with ? or $1 placeholders
 * @param params - Parameters to substitute for placeholders
 * @returns The query results as an array of rows
 */
export async function runSQL<T = unknown>(
  env: Env,
  sql: string,
  params: unknown[] = [],
): Promise<T[]> {
  // Try Supabase first
  if (isSupabaseConfigured()) {
    try {
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
    } catch (error) {
      console.error(
        "[Database] Supabase query failed, falling back to DATABASE binding:",
        error,
      );
      // Fall through to DATABASE binding
    }
  }

  // Fallback to DATABASE binding
  if (!env.MESH_REQUEST_CONTEXT?.state?.DATABASE) {
    throw new Error(
      "[Database] Neither Supabase nor DATABASE binding available. Set SUPABASE_URL+SUPABASE_ANON_KEY or configure DATABASE binding.",
    );
  }

  const response =
    await env.MESH_REQUEST_CONTEXT.state.DATABASE.DATABASES_RUN_SQL({
      sql,
      params,
    });
  // Response is typed as object but actually has .result property
  const data = response as
    | { result?: Array<{ results?: unknown[] }> }
    | undefined;
  return (data?.result?.[0]?.results ?? []) as T[];
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
