import { createClient, type SupabaseClient } from "@supabase/supabase-js";

let supabaseClient: SupabaseClient | null = null;

export function getSupabaseClient(): SupabaseClient {
  if (supabaseClient) {
    return supabaseClient;
  }

  const supabaseUrl = process.env.SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_ANON_KEY;

  if (!supabaseUrl || !supabaseKey) {
    throw new Error(
      "SUPABASE_URL and SUPABASE_ANON_KEY are required to use indexed recording search.",
    );
  }

  supabaseClient = createClient(supabaseUrl, supabaseKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  });

  return supabaseClient;
}

// ============================================================================
// TRIGGER CREDENTIALS (grain_trigger_credentials table)
// ============================================================================

interface TriggerCredentialsRow {
  connection_id: string;
  callback_url: string;
  callback_token: string;
  active_trigger_types: string[];
  updated_at: string;
}

export interface TriggerState {
  credentials: { callbackUrl: string; callbackToken: string };
  activeTriggerTypes: string[];
}

export async function saveTriggerCredentials(
  connectionId: string,
  state: TriggerState,
): Promise<void> {
  const client = getSupabaseClient();
  const { error } = await client.from("grain_trigger_credentials").upsert(
    {
      connection_id: connectionId,
      callback_url: state.credentials.callbackUrl,
      callback_token: state.credentials.callbackToken,
      active_trigger_types: state.activeTriggerTypes,
      updated_at: new Date().toISOString(),
    } as TriggerCredentialsRow,
    { onConflict: "connection_id" },
  );
  if (error) {
    throw new Error(`Failed to save trigger credentials: ${error.message}`);
  }
}

export async function loadTriggerCredentials(
  connectionId: string,
): Promise<TriggerState | null> {
  const client = getSupabaseClient();
  const { data, error } = await client
    .from("grain_trigger_credentials")
    .select("*")
    .eq("connection_id", connectionId)
    .single();

  if (error) {
    if (error.code === "PGRST116") return null;
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
  const { error } = await client
    .from("grain_trigger_credentials")
    .delete()
    .eq("connection_id", connectionId);
  if (error) {
    throw new Error(`Failed to delete trigger credentials: ${error.message}`);
  }
}
