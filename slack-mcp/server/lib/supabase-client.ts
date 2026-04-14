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
  organization_slug: string | null;
  mesh_url: string;
  mesh_token: string | null;
  agent_id: string | null;
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
    organization_slug: config.organizationSlug || null,
    mesh_url: config.meshUrl,
    mesh_token: config.meshToken || null,
    agent_id: config.agentId || null,
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
    organizationSlug: row.organization_slug || undefined,
    meshUrl: row.mesh_url,
    meshToken: row.mesh_token || undefined,
    agentId: row.agent_id || undefined,
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
      organizationSlug: row.organization_slug || undefined,
      meshUrl: row.mesh_url,
      meshToken: row.mesh_token || undefined,
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
    organizationSlug: row.organization_slug || undefined,
    meshUrl: row.mesh_url,
    meshToken: row.mesh_token || undefined,
    agentId: row.agent_id || undefined,
    botToken: row.bot_token,
    signingSecret: row.signing_secret,
    teamId: row.team_id || undefined,
    botUserId: row.bot_user_id || undefined,
    configuredAt: row.configured_at,
    updatedAt: row.updated_at,
  };
}

// ============================================================================
// TRIGGER CREDENTIALS (slack_trigger_credentials table)
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
 */
export async function saveTriggerCredentials(
  connectionId: string,
  state: TriggerState,
): Promise<void> {
  const client = getSupabaseClient();
  if (!client) {
    throw new Error("Supabase client not initialized");
  }

  const { error } = await client.from("slack_trigger_credentials").upsert(
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
 */
export async function loadTriggerCredentials(
  connectionId: string,
): Promise<TriggerState | null> {
  const client = getSupabaseClient();
  if (!client) {
    throw new Error("Supabase client not initialized");
  }

  const { data, error } = await client
    .from("slack_trigger_credentials")
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
 */
export async function deleteTriggerCredentials(
  connectionId: string,
): Promise<void> {
  const client = getSupabaseClient();
  if (!client) {
    throw new Error("Supabase client not initialized");
  }

  const { error } = await client
    .from("slack_trigger_credentials")
    .delete()
    .eq("connection_id", connectionId);

  if (error) {
    throw new Error(`Failed to delete trigger credentials: ${error.message}`);
  }

  console.log(`[Supabase] Deleted trigger credentials for ${connectionId}`);
}

/**
 * Load all trigger credentials from Supabase (for bootstrap on startup)
 */
export async function loadAllTriggerCredentials(): Promise<
  Array<{ connectionId: string; state: TriggerState }>
> {
  const client = getSupabaseClient();
  if (!client) {
    throw new Error("Supabase client not initialized");
  }

  const { data, error } = await client
    .from("slack_trigger_credentials")
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
