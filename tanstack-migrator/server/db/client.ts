/**
 * Supabase client singleton for the `sitemig_*` tables.
 *
 * SECURITY: rows hold mesh API keys and GitHub refresh grants in plaintext;
 * the service-role-only RLS policy is the only protection. Never expose raw
 * rows through MCP tools — always map to safe shapes first.
 */

import { createClient, type SupabaseClient } from "@supabase/supabase-js";

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

export function requireSupabase(): SupabaseClient {
  const client = getSupabaseClient();
  if (!client) {
    throw new Error(
      "Supabase not configured (SUPABASE_URL / SUPABASE_ANON_KEY missing)",
    );
  }
  return client;
}
