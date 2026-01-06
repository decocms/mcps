/**
 * Supabase Client Factory
 *
 * Creates and configures Supabase client instances for database operations.
 */

import { createClient as createSupabaseClient } from "@supabase/supabase-js";
import type { SupabaseClient } from "@supabase/supabase-js";

export interface SupabaseConfig {
  supabaseUrl: string;
  supabaseKey: string;
}

/**
 * Creates a Supabase client instance with the provided configuration.
 *
 * @param config - Supabase URL and API key
 * @returns Configured Supabase client
 */
export function createClient(config: SupabaseConfig): SupabaseClient {
  const { supabaseUrl, supabaseKey } = config;

  if (!supabaseUrl || !supabaseKey) {
    throw new Error(
      "Supabase URL and API key are required. Please configure them in the MCP settings.",
    );
  }

  return createSupabaseClient(supabaseUrl, supabaseKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  });
}

export type { SupabaseClient };
