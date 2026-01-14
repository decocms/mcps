/**
 * PostgreSQL Database Module
 *
 * Generic SQL runner using the DATABASE binding.
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
    await env.MESH_REQUEST_CONTEXT?.state?.DATABASE.DATABASES_RUN_SQL({
      sql,
      params: sanitizedParams,
    });
  return (response.result[0]?.results ?? []) as T[];
}
