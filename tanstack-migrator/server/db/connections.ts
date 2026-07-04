/** CRUD for sitemig_connections — mesh context snapshots per connection. */

import { requireSupabase } from "./client.ts";
import type { ConnectionRow } from "./types.ts";

export interface SaveConnectionInput {
  connectionId: string;
  organizationId: string;
  meshUrl: string;
  meshToken?: string;
  meshApiKey?: string;
  state?: Record<string, unknown>;
  pinned?: Record<string, unknown>;
}

export async function saveConnection(
  input: SaveConnectionInput,
): Promise<void> {
  const client = requireSupabase();
  const now = new Date().toISOString();

  const row: Partial<ConnectionRow> = {
    connection_id: input.connectionId,
    organization_id: input.organizationId,
    mesh_url: input.meshUrl,
    updated_at: now,
  };
  if (input.meshToken !== undefined) row.mesh_token = input.meshToken;
  if (input.meshApiKey !== undefined) row.mesh_api_key = input.meshApiKey;
  if (input.state !== undefined) row.state = input.state;
  if (input.pinned !== undefined) row.pinned = input.pinned;

  const { error } = await client
    .from("sitemig_connections")
    .upsert(row as Record<string, unknown>, { onConflict: "connection_id" });

  if (error) throw new Error(`Failed to save connection: ${error.message}`);
}

export async function loadConnection(
  connectionId: string,
): Promise<ConnectionRow | null> {
  const client = requireSupabase();
  const { data, error } = await client
    .from("sitemig_connections")
    .select("*")
    .eq("connection_id", connectionId)
    .maybeSingle();

  if (error) throw new Error(`Failed to load connection: ${error.message}`);
  return (data as ConnectionRow | null) ?? null;
}

export async function loadAllConnections(): Promise<ConnectionRow[]> {
  const client = requireSupabase();
  const { data, error } = await client
    .from("sitemig_connections")
    .select("*")
    .order("updated_at", { ascending: false });

  if (error) throw new Error(`Failed to load connections: ${error.message}`);
  return (data as ConnectionRow[]) ?? [];
}
