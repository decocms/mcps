/**
 * Supabase Client for Discord MCP
 *
 * Simplified client using @supabase/supabase-js instead of raw PostgreSQL.
 * Uses SUPABASE_URL and SUPABASE_ANON_KEY from environment.
 */

import { createClient, type SupabaseClient } from "@supabase/supabase-js";

/**
 * Database schema type for Supabase - Discord connections
 */
export interface DiscordConnectionRow {
  connection_id: string;
  organization_id: string;
  mesh_url: string;
  mesh_token: string | null; // Session token (expires)
  mesh_api_key: string | null; // Persistent API key (never expires) - PREFERRED
  system_prompt: string | null;
  bot_token: string;
  discord_public_key: string | null; // Discord application public key (for webhook verification)
  discord_application_id: string | null; // Discord application ID (for slash commands)
  authorized_guilds: string[] | null; // Array of guild IDs
  owner_id: string | null; // Discord user ID of bot owner
  command_prefix: string;
  configured_at: string;
  updated_at: string;
}

/**
 * Singleton Supabase client
 */
let supabaseClient: SupabaseClient | null = null;

/**
 * Initialize Supabase client (for all access - internal code & tools)
 * Uses ANON key with RLS policies
 *
 * ⚠️  SECURITY: NEVER create MCP tools that access discord_connections table!
 */
export function getSupabaseClient(): SupabaseClient | null {
  if (supabaseClient) {
    return supabaseClient;
  }

  const supabaseUrl = process.env.SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_ANON_KEY;

  if (!supabaseUrl || !supabaseKey) {
    console.warn(
      "[Supabase] ⚠️  Not configured. Set SUPABASE_URL and SUPABASE_ANON_KEY environment variables.",
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
 * Save or update connection config in Supabase
 * ⚠️  Uses SERVICE client to bypass RLS (internal use only)
 */
export async function saveConnectionConfig(config: {
  connectionId: string;
  organizationId: string;
  meshUrl: string;
  meshToken?: string;
  meshApiKey?: string; // Persistent API key (preferred over meshToken)
  systemPrompt?: string;
  botToken: string;
  discordPublicKey?: string; // Discord application public key (for webhook verification)
  discordApplicationId?: string; // Discord application ID (for slash commands)
  authorizedGuilds?: string[];
  ownerId?: string;
  commandPrefix?: string;
}): Promise<void> {
  const client = getSupabaseClient();
  if (!client) {
    throw new Error("Supabase client not initialized");
  }

  const now = new Date().toISOString();

  const row: Partial<DiscordConnectionRow> = {
    connection_id: config.connectionId,
    organization_id: config.organizationId,
    mesh_url: config.meshUrl,
    mesh_token: config.meshToken || null,
    mesh_api_key: config.meshApiKey || null,
    system_prompt: config.systemPrompt || null,
    bot_token: config.botToken,
    discord_public_key: config.discordPublicKey || null,
    discord_application_id: config.discordApplicationId || null,
    authorized_guilds: config.authorizedGuilds || null,
    owner_id: config.ownerId || null,
    command_prefix: config.commandPrefix || "!",
    configured_at: now,
    updated_at: now,
  };

  const { error } = await client
    .from("discord_connections")
    .upsert(row as any, {
      onConflict: "connection_id",
    });

  if (error) {
    throw new Error(`Failed to save config: ${error.message}`);
  }

  console.log(`[Supabase] 💾 Saved connection config: ${config.connectionId}`);
}

/**
 * Load connection config from Supabase
 * ⚠️  Internal use only - NEVER expose as MCP tool!
 */
export async function loadConnectionConfig(
  connectionId: string,
): Promise<DiscordConnectionRow | null> {
  const client = getSupabaseClient();
  if (!client) {
    throw new Error("Supabase client not initialized");
  }

  const { data, error } = await client
    .from("discord_connections")
    .select("*")
    .eq("connection_id", connectionId)
    .single();

  if (error) {
    if (error.code === "PGRST116") {
      // Not found
      return null;
    }
    throw new Error(`Failed to load config: ${error.message}`);
  }

  return data as DiscordConnectionRow;
}

/**
 * Load all connection configs from Supabase
 * ⚠️  Internal use only - NEVER expose as MCP tool!
 */
export async function loadAllConnectionConfigs(): Promise<
  DiscordConnectionRow[]
> {
  const client = getSupabaseClient();
  if (!client) {
    throw new Error("Supabase client not initialized");
  }

  // Order by updated_at DESC so the most recently saved config wins when
  // multiple rows share the same bot_token. The bootstrap dedups by token
  // and picks the first row it sees as "owner"; without ordering, Postgres
  // returns rows in physical order which is non-deterministic. With this
  // ordering the freshest, fully-configured row always becomes the owner.
  const { data, error } = await client
    .from("discord_connections")
    .select("*")
    .order("updated_at", { ascending: false });

  if (error) {
    throw new Error(`Failed to load configs: ${error.message}`);
  }

  return (data || []) as DiscordConnectionRow[];
}

/**
 * Delete connection config from Supabase
 * ⚠️  Internal use only - NEVER expose as MCP tool!
 */
export async function deleteConnectionConfig(
  connectionId: string,
): Promise<void> {
  const client = getSupabaseClient();
  if (!client) {
    throw new Error("Supabase client not initialized");
  }

  const { error } = await client
    .from("discord_connections")
    .delete()
    .eq("connection_id", connectionId);

  if (error) {
    throw new Error(`Failed to delete config: ${error.message}`);
  }

  console.log(`[Supabase] 🗑️ Deleted connection config: ${connectionId}`);
}

// ============================================================================
// TRIGGER CREDENTIALS (discord_trigger_credentials table)
// ============================================================================

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

/**
 * Save or update trigger credentials in Supabase
 * ⚠️  Internal use only - NEVER expose as MCP tool!
 */
export async function saveTriggerCredentials(
  connectionId: string,
  state: TriggerState,
): Promise<void> {
  const client = getSupabaseClient();
  if (!client) {
    throw new Error("Supabase client not initialized");
  }

  const { error } = await client.from("discord_trigger_credentials").upsert(
    {
      connection_id: connectionId,
      callback_url: state.credentials.callbackUrl,
      callback_token: state.credentials.callbackToken,
      active_trigger_types: state.activeTriggerTypes,
      updated_at: new Date().toISOString(),
    } as any,
    { onConflict: "connection_id" },
  );

  if (error) {
    throw new Error(`Failed to save trigger credentials: ${error.message}`);
  }

  console.log(
    `[Supabase] Saved trigger credentials for ${connectionId} (${state.activeTriggerTypes.length} types)`,
  );
}

/**
 * Load trigger credentials from Supabase
 * ⚠️  Internal use only - NEVER expose as MCP tool!
 */
export async function loadTriggerCredentials(
  connectionId: string,
): Promise<TriggerState | null> {
  const client = getSupabaseClient();
  if (!client) {
    throw new Error("Supabase client not initialized");
  }

  const { data, error } = await client
    .from("discord_trigger_credentials")
    .select("*")
    .eq("connection_id", connectionId)
    .single();

  if (error) {
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

/**
 * Delete trigger credentials from Supabase
 * ⚠️  Internal use only - NEVER expose as MCP tool!
 */
export async function deleteTriggerCredentials(
  connectionId: string,
): Promise<void> {
  const client = getSupabaseClient();
  if (!client) {
    throw new Error("Supabase client not initialized");
  }

  const { error } = await client
    .from("discord_trigger_credentials")
    .delete()
    .eq("connection_id", connectionId);

  if (error) {
    throw new Error(`Failed to delete trigger credentials: ${error.message}`);
  }

  console.log(`[Supabase] Deleted trigger credentials for ${connectionId}`);
}

/**
 * Load all trigger credentials from Supabase
 * ⚠️  Internal use only - NEVER expose as MCP tool!
 */
export async function loadAllTriggerCredentials(): Promise<
  Array<{ connectionId: string; state: TriggerState }>
> {
  const client = getSupabaseClient();
  if (!client) {
    throw new Error("Supabase client not initialized");
  }

  const { data, error } = await client
    .from("discord_trigger_credentials")
    .select("*");

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

// ============================================================================
// UTILITIES
// ============================================================================

/**
 * Count total connections in Supabase
 * ⚠️  Internal use only - NEVER expose as MCP tool!
 */
export async function countConnections(): Promise<number> {
  const client = getSupabaseClient();
  if (!client) {
    throw new Error("Supabase client not initialized");
  }

  const { count, error } = await client
    .from("discord_connections")
    .select("*", { count: "exact", head: true });

  if (error) {
    throw new Error(`Failed to count connections: ${error.message}`);
  }

  return count || 0;
}
