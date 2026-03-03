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
 * 1. localhost / 127.0.0.1:
 *    - If allowLocalhostCredit = false → not eligible regardless of email
 *    - If allowLocalhostCredit = true → eligible only if email domain matches
 *      creditEligibleEmailDomains (restricts to known team members on localhost)
 * 2. meshUrl hostname matches creditEligibleDomains → eligible (no email check)
 * 3. Otherwise → not eligible ($0 initial credit)
 */
export async function isEligibleForCredit(
  meshUrl: string | undefined,
  userEmail: string | undefined,
): Promise<boolean> {
  const defaults = await getGatewayDefaults();

  if (meshUrl) {
    try {
      const host = new URL(meshUrl).hostname.toLowerCase();

      if (host === "localhost" || host === "127.0.0.1" || host === "::1") {
        if (!defaults.allowLocalhostCredit) return false;
        // For localhost, also require the email domain to match
        if (userEmail) {
          const emailDomain = userEmail.split("@")[1]?.toLowerCase();
          if (emailDomain) {
            return defaults.creditEligibleEmailDomains.some(
              (d) =>
                emailDomain === d.toLowerCase() ||
                emailDomain.endsWith(`.${d.toLowerCase()}`),
            );
          }
        }
        return false;
      }

      // For non-localhost: only check the meshUrl domain
      return defaults.creditEligibleDomains.some(
        (d) => host === d.toLowerCase() || host.endsWith(`.${d.toLowerCase()}`),
      );
    } catch {
      // invalid URL — fall through
    }
  }

  return false;
}

export { type GatewayDefaults };
