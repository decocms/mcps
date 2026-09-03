/**
 * Shared constants for the GitHub MCP synthetic repo-grant refresh flow.
 */

/** Public origin of this MCP (custom-domain route in wrangler.toml). Used to
 * build the absolute `tokenEndpoint` returned by MINT_REPO_TOKEN. Overridable
 * via the PUBLIC_BASE_URL env var. */
export const DEFAULT_PUBLIC_BASE_URL = "https://github-mcp.decocms.com";

/** Sliding lifetime of a repo grant, in seconds (90 days). Each successful
 * refresh extends expiry by this much; also used as the KV expirationTtl so
 * orphaned grants self-expire. */
export const GRANT_TTL_SECONDS = 90 * 24 * 60 * 60;

/** Path of the synthetic OAuth refresh-token endpoint. Namespaced under
 * /repo-grant/* (NOT /oauth/*) to avoid colliding with the deco runtime's own
 * /oauth/start|callback|logout routes, which handle() intercepts before. */
export const REPO_GRANT_TOKEN_PATH = "/repo-grant/token";

/** Path of the RFC 7009-style revoke endpoint. */
export const REPO_GRANT_REVOKE_PATH = "/repo-grant/revoke";

/** KV key prefix for stored grants: `grant:<grantId>`. */
export const GRANT_KEY_PREFIX = "grant:";

/** Opaque refresh-token prefix: `ghr_<grantId>.<secret>`. */
export const REFRESH_TOKEN_PREFIX = "ghr_";

/**
 * Apex domains whose hosts (and any subdomain) are permitted as the OAuth
 * `redirect_uri` we hand to GitHub. GitHub delivers the authorization `code`
 * to this host, so an attacker-controlled value would mean code/token
 * hijacking — pinning it to decocms.com (the canonical origin lives at
 * `github-mcp.decocms.com`) closes that hole. */
export const ALLOWED_REDIRECT_HOST_SUFFIXES = ["decocms.com"] as const;

/** Env var carrying extra allowed `redirect_uri` host suffixes, comma-
 * separated, for self-hosted Mesh/Studio deployments that live outside
 * decocms.com. Deployment config rather than source so the hostnames of
 * specific installs never land in this repo. */
export const EXTRA_ALLOWED_REDIRECT_HOSTS_VAR = "EXTRA_ALLOWED_REDIRECT_HOSTS";

/**
 * Normalize one entry of EXTRA_ALLOWED_REDIRECT_HOSTS into a bare host
 * suffix, or `null` if it can't be trusted as one.
 *
 * Accepts a bare host (`studio.example.com`) or a full URL pasted whole
 * (`https://studio.example.com/oauth/callback`) — only the host survives,
 * since the runtime matches on host, not path. Single-label values (`com`,
 * `localhost`) are rejected: as a *suffix* they would open every domain
 * under that TLD.
 */
export function normalizeRedirectHostSuffix(entry: string): string | null {
  const trimmed = entry.trim();
  if (!trimmed) return null;

  const withScheme = trimmed.includes("://") ? trimmed : `https://${trimmed}`;
  let host: string;
  try {
    host = new URL(withScheme).hostname.toLowerCase();
  } catch {
    return null;
  }

  if (!host.includes(".")) return null;
  return host;
}

/**
 * Full set of host suffixes accepted as the OAuth `redirect_uri`: the
 * built-in decocms.com plus whatever this deployment adds via
 * EXTRA_ALLOWED_REDIRECT_HOSTS. Invalid entries are dropped with a warning
 * rather than throwing, so one typo can't take OAuth down for everyone.
 */
export function resolveAllowedRedirectHosts(raw: string | undefined): string[] {
  const extras: string[] = [];
  for (const entry of (raw ?? "").split(",")) {
    if (!entry.trim()) continue;
    const host = normalizeRedirectHostSuffix(entry);
    if (!host) {
      console.warn(
        `[oauth] ignoring unusable ${EXTRA_ALLOWED_REDIRECT_HOSTS_VAR} entry: ${entry.trim()}`,
      );
      continue;
    }
    extras.push(host);
  }

  return [...new Set([...ALLOWED_REDIRECT_HOST_SUFFIXES, ...extras])];
}
