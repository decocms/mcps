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
  model_provider_id: string | null;
  model_id: string | null;
  agent_id: string | null;
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
  modelProviderId?: string;
  modelId?: string;
  agentId?: string;
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
    model_provider_id: config.modelProviderId || null,
    model_id: config.modelId || null,
    agent_id: config.agentId || null,
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

  const { data, error } = await client.from("discord_connections").select("*");

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
