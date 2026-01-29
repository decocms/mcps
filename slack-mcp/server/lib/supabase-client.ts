/**
 * Supabase Client for Slack MCP
 *
 * Simplified client using @supabase/supabase-js instead of raw PostgreSQL.
 * Uses SUPABASE_URL and SUPABASE_ANON_KEY from environment.
 */

import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { ConnectionConfig } from "./config-cache.ts";

/**
 * Database schema type for Supabase
 */
export interface SlackConnectionRow {
  connection_id: string;
  organization_id: string;
  mesh_url: string;
  mesh_token: string | null;
  model_provider_id: string | null;
  model_id: string | null;
  agent_id: string | null;
  system_prompt: string | null;
  bot_token: string;
  signing_secret: string;
  team_id: string | null;
  bot_user_id: string | null;
  configured_at: string;
  updated_at: string;
}

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
 */
export async function saveConnectionConfig(
  config: ConnectionConfig,
): Promise<void> {
  const client = getSupabaseClient();
  if (!client) {
    throw new Error("Supabase client not initialized");
  }

  const now = new Date().toISOString();

  const row: Partial<SlackConnectionRow> = {
    connection_id: config.connectionId,
    organization_id: config.organizationId,
    mesh_url: config.meshUrl,
    mesh_token: config.meshToken || null,
    model_provider_id: config.modelProviderId || null,
    model_id: config.modelId || null,
    agent_id: config.agentId || null,
    system_prompt: config.systemPrompt || null,
    bot_token: config.botToken,
    signing_secret: config.signingSecret,
    team_id: config.teamId || null,
    bot_user_id: config.botUserId || null,
    configured_at: now,
    updated_at: now,
  };

  const { error } = await client.from("slack_connections").upsert(row as any, {
    onConflict: "connection_id",
  });

  if (error) {
    throw new Error(`Failed to save config: ${error.message}`);
  }

  console.log(`[Supabase] 💾 Saved connection config: ${config.connectionId}`);
}

/**
 * Load connection config from Supabase
 */
export async function loadConnectionConfig(
  connectionId: string,
): Promise<ConnectionConfig | null> {
  const client = getSupabaseClient();
  if (!client) {
    throw new Error("Supabase client not initialized");
  }

  const { data, error } = await client
    .from("slack_connections")
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

  if (!data) {
    return null;
  }

  const row = data as SlackConnectionRow;

  return {
    connectionId: row.connection_id,
    organizationId: row.organization_id,
    meshUrl: row.mesh_url,
    meshToken: row.mesh_token || undefined,
    modelProviderId: row.model_provider_id || undefined,
    modelId: row.model_id || undefined,
    agentId: row.agent_id || undefined,
    systemPrompt: row.system_prompt || undefined,
    botToken: row.bot_token,
    signingSecret: row.signing_secret,
    teamId: row.team_id || undefined,
    botUserId: row.bot_user_id || undefined,
    configuredAt: row.configured_at,
    updatedAt: row.updated_at,
  };
}

/**
 * Load all connection configs from Supabase
 */
export async function loadAllConnectionConfigs(): Promise<ConnectionConfig[]> {
  const client = getSupabaseClient();
  if (!client) {
    throw new Error("Supabase client not initialized");
  }

  const { data, error } = await client.from("slack_connections").select("*");

  if (error) {
    throw new Error(`Failed to load configs: ${error.message}`);
  }

  return (data || []).map((item) => {
    const row = item as SlackConnectionRow;
    return {
      connectionId: row.connection_id,
      organizationId: row.organization_id,
      meshUrl: row.mesh_url,
      meshToken: row.mesh_token || undefined,
      modelProviderId: row.model_provider_id || undefined,
      modelId: row.model_id || undefined,
      agentId: row.agent_id || undefined,
      systemPrompt: row.system_prompt || undefined,
      botToken: row.bot_token,
      signingSecret: row.signing_secret,
      teamId: row.team_id || undefined,
      botUserId: row.bot_user_id || undefined,
      configuredAt: row.configured_at,
      updatedAt: row.updated_at,
    };
  });
}

/**
 * Delete connection config from Supabase
 */
export async function deleteConnectionConfig(
  connectionId: string,
): Promise<void> {
  const client = getSupabaseClient();
  if (!client) {
    throw new Error("Supabase client not initialized");
  }

  const { error } = await client
    .from("slack_connections")
    .delete()
    .eq("connection_id", connectionId);

  if (error) {
    throw new Error(`Failed to delete config: ${error.message}`);
  }

  console.log(`[Supabase] 🗑️ Deleted connection config: ${connectionId}`);
}

/**
 * Count total connections in Supabase
 */
export async function countConnections(): Promise<number> {
  const client = getSupabaseClient();
  if (!client) {
    throw new Error("Supabase client not initialized");
  }

  const { count, error } = await client
    .from("slack_connections")
    .select("*", { count: "exact", head: true });

  if (error) {
    throw new Error(`Failed to count connections: ${error.message}`);
  }

  return count || 0;
}

/**
 * Load connection by team_id (for webhook routing)
 */
export async function loadConnectionByTeamId(
  teamId: string,
): Promise<ConnectionConfig | null> {
  const client = getSupabaseClient();
  if (!client) {
    throw new Error("Supabase client not initialized");
  }

  const { data, error } = await client
    .from("slack_connections")
    .select("*")
    .eq("team_id", teamId)
    .single();

  if (error) {
    if (error.code === "PGRST116") {
      // Not found
      return null;
    }
    throw new Error(`Failed to load config by team_id: ${error.message}`);
  }

  if (!data) {
    return null;
  }

  const row = data as SlackConnectionRow;

  return {
    connectionId: row.connection_id,
    organizationId: row.organization_id,
    meshUrl: row.mesh_url,
    meshToken: row.mesh_token || undefined,
    modelProviderId: row.model_provider_id || undefined,
    modelId: row.model_id || undefined,
    agentId: row.agent_id || undefined,
    systemPrompt: row.system_prompt || undefined,
    botToken: row.bot_token,
    signingSecret: row.signing_secret,
    teamId: row.team_id || undefined,
    botUserId: row.bot_user_id || undefined,
    configuredAt: row.configured_at,
    updatedAt: row.updated_at,
  };
}
