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
