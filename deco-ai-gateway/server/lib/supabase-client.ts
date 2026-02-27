import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { logger } from "./logger.ts";

export type BillingMode = "prepaid" | "postpaid";

export interface LlmGatewayConnectionRow {
  connection_id: string;
  organization_id: string;
  mesh_url: string;
  openrouter_key_name: string | null;
  openrouter_key_hash: string | null;
  encrypted_api_key: string | null;
  encryption_iv: string | null;
  encryption_tag: string | null;
  billing_mode: BillingMode;
  usage_markup_pct: number;
  max_limit_usd: number | null;
  configured_at: string;
  updated_at: string;
}

const TABLE_NAME = "llm_gateway_connections";
const PAYMENTS_TABLE = "llm_gateway_payments";

export interface LlmGatewayPaymentRow {
  id?: string;
  connection_id: string;
  organization_id: string;
  stripe_session_id: string;
  amount_cents: number;
  current_limit_usd: number | null;
  new_limit_usd: number;
  markup_pct: number;
  status: "pending" | "processing" | "completed" | "expired";
  created_at?: string;
  completed_at?: string | null;
}

let supabaseClient: SupabaseClient | null = null;

export function getSupabaseClient(): SupabaseClient | null {
  if (supabaseClient) {
    return supabaseClient;
  }

  const supabaseUrl = process.env.SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !supabaseKey) {
    logger.warn("Supabase not configured", {
      SUPABASE_URL: supabaseUrl ? "set" : "missing",
      SUPABASE_SERVICE_ROLE_KEY: supabaseKey ? "set" : "missing",
    });
    return null;
  }

  try {
    supabaseClient = createClient(supabaseUrl, supabaseKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    logger.info("Supabase client initialized");
    return supabaseClient;
  } catch (error) {
    logger.error("Failed to initialize Supabase client", {
      error: String(error),
    });
    return null;
  }
}

export function isSupabaseConfigured(): boolean {
  return !!process.env.SUPABASE_URL && !!process.env.SUPABASE_SERVICE_ROLE_KEY;
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

  logger.info("Connection config saved", { connectionId: row.connection_id });
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

  logger.info("Connection config deleted", { connectionId });
}

// ---------------------------------------------------------------------------
// Billing config (mode + markup)
// ---------------------------------------------------------------------------

export interface BillingConfig {
  billingMode: BillingMode;
  usageMarkupPct: number;
  maxLimitUsd: number | null;
}

export async function updateBillingConfig(
  connectionId: string,
  config: Partial<BillingConfig>,
): Promise<void> {
  const client = getSupabaseClient();
  if (!client) {
    throw new Error("Supabase client not initialized");
  }

  const updates: Record<string, unknown> = {
    updated_at: new Date().toISOString(),
  };
  if (config.billingMode !== undefined) {
    updates.billing_mode = config.billingMode;
  }
  if (config.usageMarkupPct !== undefined) {
    updates.usage_markup_pct = config.usageMarkupPct;
  }
  if (config.maxLimitUsd !== undefined) {
    updates.max_limit_usd = config.maxLimitUsd;
  }

  const { error } = await client
    .from(TABLE_NAME)
    .update(updates)
    .eq("connection_id", connectionId);

  if (error) {
    throw new Error(`Failed to update billing config: ${error.message}`);
  }

  logger.info("Billing config updated", { connectionId, ...config });
}

// ---------------------------------------------------------------------------
// Payments
// ---------------------------------------------------------------------------

export async function savePendingPayment(
  payment: Omit<LlmGatewayPaymentRow, "id" | "created_at" | "completed_at">,
): Promise<void> {
  const client = getSupabaseClient();
  if (!client) {
    throw new Error("Supabase client not initialized");
  }

  const { error } = await client.from(PAYMENTS_TABLE).insert({
    ...payment,
    status: "pending",
  });

  if (error) {
    throw new Error(`Failed to save payment: ${error.message}`);
  }

  logger.info("Pending payment saved", {
    connectionId: payment.connection_id,
    stripeSessionId: payment.stripe_session_id,
  });
}

export async function loadPendingPayment(
  connectionId: string,
): Promise<LlmGatewayPaymentRow | null> {
  const client = getSupabaseClient();
  if (!client) {
    throw new Error("Supabase client not initialized");
  }

  const { data, error } = await client
    .from(PAYMENTS_TABLE)
    .select("*")
    .eq("connection_id", connectionId)
    .eq("status", "pending")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) {
    throw new Error(`Failed to load pending payment: ${error.message}`);
  }

  return data as LlmGatewayPaymentRow | null;
}

export async function markPaymentCompleted(id: string): Promise<void> {
  const client = getSupabaseClient();
  if (!client) {
    throw new Error("Supabase client not initialized");
  }

  const { error } = await client
    .from(PAYMENTS_TABLE)
    .update({ status: "completed", completed_at: new Date().toISOString() })
    .eq("id", id);

  if (error) {
    throw new Error(`Failed to mark payment completed: ${error.message}`);
  }

  logger.info("Payment marked as completed", { paymentId: id });
}

export async function markPaymentExpired(id: string): Promise<void> {
  const client = getSupabaseClient();
  if (!client) {
    throw new Error("Supabase client not initialized");
  }

  const { error } = await client
    .from(PAYMENTS_TABLE)
    .update({ status: "expired" })
    .eq("id", id);

  if (error) {
    throw new Error(`Failed to mark payment expired: ${error.message}`);
  }

  logger.info("Payment marked as expired", { paymentId: id });
}

/**
 * Atomically claim a pending payment by transitioning status from
 * 'pending' to 'processing'. Returns null if no pending payment exists
 * or if another concurrent call already claimed it.
 */
export async function claimPendingPayment(
  connectionId: string,
): Promise<LlmGatewayPaymentRow | null> {
  const client = getSupabaseClient();
  if (!client) {
    throw new Error("Supabase client not initialized");
  }

  const pending = await loadPendingPayment(connectionId);
  if (!pending?.id) return null;

  const { data, error } = await client
    .from(PAYMENTS_TABLE)
    .update({ status: "processing" })
    .eq("id", pending.id)
    .eq("status", "pending")
    .select()
    .maybeSingle();

  if (error) {
    throw new Error(`Failed to claim payment: ${error.message}`);
  }

  return data as LlmGatewayPaymentRow | null;
}

/**
 * Release a claimed payment back to 'pending' (e.g. when amount validation fails).
 */
export async function releasePaymentClaim(id: string): Promise<void> {
  const client = getSupabaseClient();
  if (!client) {
    throw new Error("Supabase client not initialized");
  }

  const { error } = await client
    .from(PAYMENTS_TABLE)
    .update({ status: "pending" })
    .eq("id", id)
    .eq("status", "processing");

  if (error) {
    throw new Error(`Failed to release payment claim: ${error.message}`);
  }

  logger.info("Payment claim released back to pending", { paymentId: id });
}
