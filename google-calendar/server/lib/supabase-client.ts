/**
 * Supabase Client for Google Calendar MCP
 *
 * Backs the trigger credentials store (callbackUrl/callbackToken per
 * connection). Mirrors the slack-mcp pattern: a singleton client reading
 * SUPABASE_URL / SUPABASE_ANON_KEY from the environment.
 *
 * Why persistence is required: the runtime only hands us the trigger
 * callbackUrl/callbackToken once, inside TRIGGER_CONFIGURE. It never replays
 * them on restart. Without a persistent store, every inbound webhook from
 * Google Apps Script would have nowhere to forward to after a redeploy.
 */

import { createClient, type SupabaseClient } from "@supabase/supabase-js";

const TABLE = "calendar_trigger_credentials";

interface TriggerCredentialsRow {
  connection_id: string;
  callback_url: string;
  callback_token: string;
  active_trigger_types: string[];
  created_at: string;
  updated_at: string;
}

export interface TriggerState {
  credentials: { callbackUrl: string; callbackToken: string };
  activeTriggerTypes: string[];
}

let supabaseClient: SupabaseClient | null = null;

export function getSupabaseClient(): SupabaseClient | null {
  if (supabaseClient) {
    return supabaseClient;
  }

  const supabaseUrl = process.env.SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_ANON_KEY;

  if (!supabaseUrl || !supabaseKey) {
    return null;
  }

  try {
    supabaseClient = createClient(supabaseUrl, supabaseKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    console.log("[Supabase] ✅ Client initialized successfully");
    return supabaseClient;
  } catch (error) {
    console.error("[Supabase] ❌ Failed to initialize client:", error);
    return null;
  }
}

export function isSupabaseConfigured(): boolean {
  return !!process.env.SUPABASE_URL && !!process.env.SUPABASE_ANON_KEY;
}

export async function saveTriggerCredentials(
  connectionId: string,
  state: TriggerState,
): Promise<void> {
  const client = getSupabaseClient();
  if (!client) {
    throw new Error("Supabase client not initialized");
  }

  const { error } = await client.from(TABLE).upsert(
    {
      connection_id: connectionId,
      callback_url: state.credentials.callbackUrl,
      callback_token: state.credentials.callbackToken,
      active_trigger_types: state.activeTriggerTypes,
      updated_at: new Date().toISOString(),
    } as never,
    { onConflict: "connection_id" },
  );

  if (error) {
    throw new Error(`Failed to save trigger credentials: ${error.message}`);
  }

  console.log(
    `[Supabase] Saved trigger credentials for ${connectionId} (${state.activeTriggerTypes.length} types)`,
  );
}

export async function loadTriggerCredentials(
  connectionId: string,
): Promise<TriggerState | null> {
  const client = getSupabaseClient();
  if (!client) {
    throw new Error("Supabase client not initialized");
  }

  const { data, error } = await client
    .from(TABLE)
    .select("*")
    .eq("connection_id", connectionId)
    .single();

  if (error) {
    // PGRST116 = no rows found
    if (error.code === "PGRST116") {
      return null;
    }
    throw new Error(`Failed to load trigger credentials: ${error.message}`);
  }

  const row = data as TriggerCredentialsRow;
  return {
    credentials: {
      callbackUrl: row.callback_url,
      callbackToken: row.callback_token,
    },
    activeTriggerTypes: row.active_trigger_types,
  };
}

export async function deleteTriggerCredentials(
  connectionId: string,
): Promise<void> {
  const client = getSupabaseClient();
  if (!client) {
    throw new Error("Supabase client not initialized");
  }

  const { error } = await client
    .from(TABLE)
    .delete()
    .eq("connection_id", connectionId);

  if (error) {
    throw new Error(`Failed to delete trigger credentials: ${error.message}`);
  }

  console.log(`[Supabase] Deleted trigger credentials for ${connectionId}`);
}

/**
 * Load all trigger credentials (bootstrap on startup — warms the store and
 * surfaces how many connections have active triggers).
 */
export async function loadAllTriggerCredentials(): Promise<
  Array<{ connectionId: string; state: TriggerState }>
> {
  const client = getSupabaseClient();
  if (!client) {
    throw new Error("Supabase client not initialized");
  }

  const { data, error } = await client.from(TABLE).select("*");

  if (error) {
    throw new Error(`Failed to load trigger credentials: ${error.message}`);
  }

  return ((data || []) as TriggerCredentialsRow[]).map((row) => ({
    connectionId: row.connection_id,
    state: {
      credentials: {
        callbackUrl: row.callback_url,
        callbackToken: row.callback_token,
      },
      activeTriggerTypes: row.active_trigger_types,
    },
  }));
}
