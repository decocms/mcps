import type { Env } from "../types/env.ts";

export async function runSQL<T = unknown>(
  env: Env,
  sql: string,
  params: unknown[] = [],
): Promise<T[]> {
  const db = env.MESH_REQUEST_CONTEXT?.state?.DATABASE;
  if (!db) {
    throw new Error(
      "[DB] DATABASE binding is unavailable. Ensure MESH_REQUEST_CONTEXT is properly configured.",
    );
  }
  const response = (await db.DATABASES_RUN_SQL({
    sql,
    params,
  })) as { result: { results: T[] }[] };
  return (response.result[0]?.results ?? []) as T[];
}
