/**
 * Supabase client + CRUD for the `discord2_*` tables.
 *
 * Tables (see migrations/):
 *   - discord2_connections           (per-connection bot config + state snapshot)
 *   - discord2_trigger_credentials   (callback URLs for the runtime triggers system)
 *
 * SECURITY: bot_token is plaintext; the service-role-only RLS policy is the
 * only thing standing between this row and a public dump. Never expose any of
 * the functions below as MCP tools.
 */

import { createClient, type SupabaseClient } from "@supabase/supabase-js";

export interface DiscordConnectionRow {
  connection_id: string;
  organization_id: string;
  mesh_url: string;
  mesh_token: string | null;
  mesh_api_key: string | null;
  bot_token: string;
  discord_public_key: string | null;
  discord_application_id: string | null;
  authorized_guilds: string[] | null;
  state: Record<string, unknown> | null;
  configured_at: string;
  updated_at: string;
}

interface TriggerCredentialsRow {
  connection_id: string;
  callback_url: string;
  callback_token: string;
  active_trigger_types: string[];
  created_at: string;
  updated_at: string;
}

interface TriggerState {
  credentials: { callbackUrl: string; callbackToken: string };
  activeTriggerTypes: string[];
}

let supabaseClient: SupabaseClient | null = null;

export function getSupabaseClient(): SupabaseClient | null {
  if (supabaseClient) return supabaseClient;

  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_ANON_KEY;
  if (!url || !key) return null;

  try {
    supabaseClient = createClient(url, key, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    return supabaseClient;
  } catch {
    return null;
  }
}

export function isSupabaseConfigured(): boolean {
  return !!process.env.SUPABASE_URL && !!process.env.SUPABASE_ANON_KEY;
}

// ============================================================================
// discord2_connections
// ============================================================================

export async function saveConnectionConfig(config: {
  connectionId: string;
  organizationId: string;
  meshUrl: string;
  meshToken?: string;
  meshApiKey?: string;
  botToken: string;
  discordPublicKey?: string;
  discordApplicationId?: string;
  authorizedGuilds?: string[];
  state?: Record<string, unknown>;
}): Promise<void> {
  const client = getSupabaseClient();
  if (!client) throw new Error("Supabase client not initialized");

  const now = new Date().toISOString();
  const row: Partial<DiscordConnectionRow> = {
    connection_id: config.connectionId,
    organization_id: config.organizationId,
    mesh_url: config.meshUrl,
    mesh_token: config.meshToken || null,
    mesh_api_key: config.meshApiKey || null,
    bot_token: config.botToken,
    discord_public_key: config.discordPublicKey || null,
    discord_application_id: config.discordApplicationId || null,
    authorized_guilds: config.authorizedGuilds || null,
    state: config.state ?? null,
    configured_at: now,
    updated_at: now,
  };

  const { error } = await client
    .from("discord2_connections")
    .upsert(row as Record<string, unknown>, { onConflict: "connection_id" });

  if (error) throw new Error(`Failed to save config: ${error.message}`);
}

export async function loadConnectionConfig(
  connectionId: string,
): Promise<DiscordConnectionRow | null> {
  const client = getSupabaseClient();
  if (!client) throw new Error("Supabase client not initialized");

  const { data, error } = await client
    .from("discord2_connections")
    .select("*")
    .eq("connection_id", connectionId)
    .single();

  if (error) {
    if (error.code === "PGRST116") return null;
    throw new Error(`Failed to load config: ${error.message}`);
  }
  return data as DiscordConnectionRow;
}

export async function loadAllConnectionConfigs(): Promise<
  DiscordConnectionRow[]
> {
  const client = getSupabaseClient();
  if (!client) throw new Error("Supabase client not initialized");

  // updated_at DESC: when multiple rows share a bot_token, the freshest config
  // becomes the primary owner during bootstrap dedup.
  const { data, error } = await client
    .from("discord2_connections")
    .select("*")
    .order("updated_at", { ascending: false });

  if (error) throw new Error(`Failed to load configs: ${error.message}`);
  return (data || []) as DiscordConnectionRow[];
}

export async function deleteConnectionConfig(
  connectionId: string,
): Promise<void> {
  const client = getSupabaseClient();
  if (!client) throw new Error("Supabase client not initialized");

  const { error } = await client
    .from("discord2_connections")
    .delete()
    .eq("connection_id", connectionId);

  if (error) throw new Error(`Failed to delete config: ${error.message}`);
}

// ============================================================================
// discord2_trigger_credentials
// ============================================================================

export async function saveTriggerCredentials(
  connectionId: string,
  state: TriggerState,
): Promise<void> {
  const client = getSupabaseClient();
  if (!client) throw new Error("Supabase client not initialized");

  const { error } = await client.from("discord2_trigger_credentials").upsert(
    {
      connection_id: connectionId,
      callback_url: state.credentials.callbackUrl,
      callback_token: state.credentials.callbackToken,
      active_trigger_types: state.activeTriggerTypes,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "connection_id" },
  );

  if (error)
    throw new Error(`Failed to save trigger credentials: ${error.message}`);
}

export async function loadTriggerCredentials(
  connectionId: string,
): Promise<TriggerState | null> {
  const client = getSupabaseClient();
  if (!client) throw new Error("Supabase client not initialized");

  const { data, error } = await client
    .from("discord2_trigger_credentials")
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
  if (!client) throw new Error("Supabase client not initialized");

  const { error } = await client
    .from("discord2_trigger_credentials")
    .delete()
    .eq("connection_id", connectionId);

  if (error)
    throw new Error(`Failed to delete trigger credentials: ${error.message}`);
}

export async function loadAllTriggerCredentials(): Promise<
  Array<{ connectionId: string; state: TriggerState }>
> {
  const client = getSupabaseClient();
  if (!client) throw new Error("Supabase client not initialized");

  const { data, error } = await client
    .from("discord2_trigger_credentials")
    .select("*");

  if (error)
    throw new Error(`Failed to load trigger credentials: ${error.message}`);

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
