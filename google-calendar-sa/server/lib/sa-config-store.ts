/**
 * Persist SA connection configs in Supabase so the scheduler survives
 * pod restarts without waiting for onChange to fire.
 *
 * Table: calendar_sa_connections
 *   connection_id text primary key
 *   service_account_json text not null
 *   impersonate_emails text[] not null
 *   lead_minutes int not null default 10
 *   updated_at timestamptz default now()
 */

import { getSupabaseClient } from "google-calendar/supabase";

const TABLE = "calendar_sa_connections";

interface SAConfigRow {
  connection_id: string;
  service_account_json: string;
  impersonate_emails: string[];
  lead_minutes: number;
  updated_at: string;
}

export interface SAConfig {
  connectionId: string;
  serviceAccountJson: string;
  impersonateEmails: string[];
  leadMinutes: number;
}

export async function saveSAConfig(config: SAConfig): Promise<void> {
  const client = getSupabaseClient();
  if (!client) return;

  const { error } = await client.from(TABLE).upsert(
    {
      connection_id: config.connectionId,
      service_account_json: config.serviceAccountJson,
      impersonate_emails: config.impersonateEmails,
      lead_minutes: config.leadMinutes,
      updated_at: new Date().toISOString(),
    } as never,
    { onConflict: "connection_id" },
  );

  if (error) {
    console.error(
      `[SA Config] Failed to save ${config.connectionId}:`,
      error.message,
    );
  }
}

export async function loadAllSAConfigs(): Promise<SAConfig[]> {
  const client = getSupabaseClient();
  if (!client) return [];

  const { data, error } = await client.from(TABLE).select("*");

  if (error) {
    console.error("[SA Config] Failed to load:", error.message);
    return [];
  }

  return ((data || []) as SAConfigRow[]).map((row) => ({
    connectionId: row.connection_id,
    serviceAccountJson: row.service_account_json,
    impersonateEmails: row.impersonate_emails,
    leadMinutes: row.lead_minutes,
  }));
}
