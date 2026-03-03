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

/**
 * Determine if a new prepaid key should receive the free credit grant.
 *
 * Eligibility rules (evaluated in order):
 * 1. localhost / 127.0.0.1 → only eligible if allowLocalhostCredit = true in DB
 * 2. meshUrl hostname matches creditEligibleDomains → eligible
 * 3. userEmail domain matches creditEligibleEmailDomains → eligible
 * 4. Otherwise → not eligible ($0 initial credit)
 */
export async function isEligibleForCredit(
  meshUrl: string | undefined,
  userEmail: string | undefined,
): Promise<boolean> {
  const defaults = await getGatewayDefaults();

  if (meshUrl) {
    try {
      const host = new URL(meshUrl).hostname;
      if (host === "localhost" || host === "127.0.0.1") {
        return defaults.allowLocalhostCredit;
      }
      const meshMatch = defaults.creditEligibleDomains.some(
        (d) => host === d || host.endsWith(`.${d}`),
      );
      if (meshMatch) return true;
    } catch {
      // invalid URL — fall through
    }
  }

  if (userEmail) {
    const emailDomain = userEmail.split("@")[1]?.toLowerCase();
    if (emailDomain) {
      const emailMatch = defaults.creditEligibleEmailDomains.some(
        (d) => emailDomain === d || emailDomain.endsWith(`.${d}`),
      );
      if (emailMatch) return true;
    }
  }

  return false;
}

export { type GatewayDefaults };
