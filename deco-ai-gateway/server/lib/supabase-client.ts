import { createClient, type SupabaseClient } from "@supabase/supabase-js";

export interface LlmGatewayConnectionRow {
  connection_id: string;
  organization_id: string;
  mesh_url: string;
  openrouter_key_name: string | null;
  openrouter_key_hash: string | null;
  encrypted_api_key: string | null;
  encryption_iv: string | null;
  encryption_tag: string | null;
  configured_at: string;
  updated_at: string;
}

const TABLE_NAME = "llm_gateway_connections";

let supabaseClient: SupabaseClient | null = null;

export function getSupabaseClient(): SupabaseClient | null {
  if (supabaseClient) {
    return supabaseClient;
  }

  const supabaseUrl = process.env.SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_ANON_KEY;

  if (!supabaseUrl || !supabaseKey) {
    console.warn(
      "[Supabase] Not configured. Set SUPABASE_URL and SUPABASE_ANON_KEY.",
    );
    return null;
  }

  try {
    supabaseClient = createClient(supabaseUrl, supabaseKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    console.log("[Supabase] Client initialized");
    return supabaseClient;
  } catch (error) {
    console.error("[Supabase] Failed to initialize:", error);
    return null;
  }
}

export function isSupabaseConfigured(): boolean {
  return !!process.env.SUPABASE_URL && !!process.env.SUPABASE_ANON_KEY;
}

export async function saveConnectionConfig(
  row: LlmGatewayConnectionRow,
): Promise<void> {
  const client = getSupabaseClient();
  if (!client) {
    throw new Error("Supabase client not initialized");
  }

  const { error } = await client
    .from(TABLE_NAME)
    .upsert(row, { onConflict: "connection_id" });

  if (error) {
    throw new Error(`Failed to save config: ${error.message}`);
  }

  console.log(`[Supabase] Saved config: ${row.connection_id}`);
}

export async function loadConnectionConfig(
  connectionId: string,
): Promise<LlmGatewayConnectionRow | null> {
  const client = getSupabaseClient();
  if (!client) {
    throw new Error("Supabase client not initialized");
  }

  const { data, error } = await client
    .from(TABLE_NAME)
    .select("*")
    .eq("connection_id", connectionId)
    .single();

  if (error) {
    if (error.code === "PGRST116") {
      return null;
    }
    throw new Error(`Failed to load config: ${error.message}`);
  }

  return data as LlmGatewayConnectionRow;
}

export async function deleteConnectionConfig(
  connectionId: string,
): Promise<void> {
  const client = getSupabaseClient();
  if (!client) {
    throw new Error("Supabase client not initialized");
  }

  const { error } = await client
    .from(TABLE_NAME)
    .delete()
    .eq("connection_id", connectionId);

  if (error) {
    throw new Error(`Failed to delete config: ${error.message}`);
  }

  console.log(`[Supabase] Deleted config: ${connectionId}`);
}
