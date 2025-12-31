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
    await env.MESH_REQUEST_CONTEXT.state.DATABASE.DATABASES_RUN_SQL({
      sql,
      params,
    });
  return (response.result[0]?.results ?? []) as T[];
}
