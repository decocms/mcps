import {
  loadGatewayDefaults,
  type GatewayDefaults,
} from "./supabase-client.ts";

export const PROVISIONING_TIMEOUT_MS = 30_000;
export const ALLOWED_REDIRECT_DOMAINS = ["decocache.com", "deco.cx"];

/**
 * Load billing defaults from the database (cached for 5 min).
 * Falls back to hardcoded values if the DB is unavailable.
 */
export async function getGatewayDefaults(): Promise<GatewayDefaults> {
  return loadGatewayDefaults();
}

export { type GatewayDefaults };
