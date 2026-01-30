/**
 * PostgreSQL Database Module
 *
 * Generic SQL runner using the DATABASE binding.
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
  const response =
    await env.MESH_REQUEST_CONTEXT?.state?.DATABASE.DATABASES_RUN_SQL({
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
 * @param env - The environment containing the DATABASE binding
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
