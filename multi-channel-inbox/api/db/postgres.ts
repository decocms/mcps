import type { Env } from "../types/env.ts";

export async function runSQL<T = unknown>(
  env: Env,
  sql: string,
  params: unknown[] = [],
): Promise<T[]> {
  const response =
    (await env.MESH_REQUEST_CONTEXT?.state?.DATABASE.DATABASES_RUN_SQL({
      sql,
      params,
    })) as { result: { results: T[] }[] };
  return (response.result[0]?.results ?? []) as T[];
}
