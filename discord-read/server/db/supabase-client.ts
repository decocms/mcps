/**
 * Supabase Client for Discord MCP
 *
 * Replaces DATABASE binding with Supabase Client.
 * Uses SUPABASE_URL and SUPABASE_ANON_KEY from environment.
 */

import { createClient, type SupabaseClient } from "@supabase/supabase-js";

/**
 * Singleton Supabase client
 */
let supabaseClient: SupabaseClient | null = null;

/**
 * Initialize Supabase client
 */
export function getSupabaseClient(): SupabaseClient | null {
  if (supabaseClient) {
    return supabaseClient;
  }

  const supabaseUrl = process.env.SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_ANON_KEY;

  if (!supabaseUrl || !supabaseKey) {
    console.log(
      "[Supabase] Not configured (SUPABASE_URL or SUPABASE_ANON_KEY missing)",
    );
    return null;
  }

  try {
    supabaseClient = createClient(supabaseUrl, supabaseKey, {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
      },
    });

    console.log("[Supabase] ✅ Client initialized successfully");
    return supabaseClient;
  } catch (error) {
    console.error("[Supabase] ❌ Failed to initialize client:", error);
    return null;
  }
}

/**
 * Check if Supabase is configured and available
 */
export function isSupabaseConfigured(): boolean {
  return !!process.env.SUPABASE_URL && !!process.env.SUPABASE_ANON_KEY;
}

/**
 * Run a SQL query using Supabase Client
 * @param sql - SQL query with $1, $2, etc. placeholders
 * @param params - Parameters to substitute
 * @returns The query results as an array of rows
 */
export async function runSQL<T = unknown>(
  sql: string,
  params: unknown[] = [],
): Promise<T[]> {
  const client = getSupabaseClient();

  if (!client) {
    throw new Error(
      "[Supabase] Client not initialized. Set SUPABASE_URL and SUPABASE_ANON_KEY.",
    );
  }

  try {
    // Supabase uses RPC for raw SQL
    // We need to create a stored procedure in Supabase for this
    // For now, we'll use the REST API directly

    // Note: For complex queries, you'll need to create RPC functions in Supabase
    // This is a simple implementation that works for basic queries

    const { data, error } = await client.rpc("execute_sql", {
      query: sql,
      params: params,
    });

    if (error) {
      throw new Error(`SQL execution failed: ${error.message}`);
    }

    return (data || []) as T[];
  } catch (error) {
    console.error("[Supabase] SQL execution error:", error);
    throw error;
  }
}

/**
 * Run multiple SQL statements in sequence
 * @param statements - Array of SQL statements to execute
 */
export async function runSQLBatch(statements: string[]): Promise<void> {
  const client = getSupabaseClient();

  if (!client) {
    throw new Error("[Supabase] Client not initialized.");
  }

  for (const statement of statements) {
    await runSQL(statement);
  }
}

/**
 * Generic table operations
 */

/**
 * Insert a row into a table
 */
export async function insert<T>(
  table: string,
  data: Partial<T>,
): Promise<void> {
  const client = getSupabaseClient();

  if (!client) {
    throw new Error("[Supabase] Client not initialized.");
  }

  const { error } = await client.from(table).insert(data as any);

  if (error) {
    throw new Error(`Insert failed: ${error.message}`);
  }
}

/**
 * Update rows in a table
 */
export async function update<T>(
  table: string,
  data: Partial<T>,
  condition: { column: string; value: unknown },
): Promise<void> {
  const client = getSupabaseClient();

  if (!client) {
    throw new Error("[Supabase] Client not initialized.");
  }

  const { error } = await client
    .from(table)
    .update(data as any)
    .eq(condition.column, condition.value);

  if (error) {
    throw new Error(`Update failed: ${error.message}`);
  }
}

/**
 * Delete rows from a table
 */
export async function deleteFrom(
  table: string,
  condition: { column: string; value: unknown },
): Promise<void> {
  const client = getSupabaseClient();

  if (!client) {
    throw new Error("[Supabase] Client not initialized.");
  }

  const { error } = await client
    .from(table)
    .delete()
    .eq(condition.column, condition.value);

  if (error) {
    throw new Error(`Delete failed: ${error.message}`);
  }
}

/**
 * Select rows from a table
 */
export async function select<T>(
  table: string,
  columns = "*",
  condition?: { column: string; value: unknown },
  limit?: number,
): Promise<T[]> {
  const client = getSupabaseClient();

  if (!client) {
    throw new Error("[Supabase] Client not initialized.");
  }

  let query = client.from(table).select(columns);

  if (condition) {
    query = query.eq(condition.column, condition.value);
  }

  if (limit) {
    query = query.limit(limit);
  }

  const { data, error } = await query;

  if (error) {
    throw new Error(`Select failed: ${error.message}`);
  }

  return (data || []) as T[];
}

/**
 * Upsert (insert or update) a row
 */
export async function upsert<T>(
  table: string,
  data: Partial<T>,
  onConflict: string,
): Promise<void> {
  const client = getSupabaseClient();

  if (!client) {
    throw new Error("[Supabase] Client not initialized.");
  }

  const { error } = await client.from(table).upsert(data as any, {
    onConflict,
  });

  if (error) {
    throw new Error(`Upsert failed: ${error.message}`);
  }
}
