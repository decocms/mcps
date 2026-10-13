/**
 * OAuth `redirect_uri` allowlist.
 *
 * The runtime hands `authorizationUrl()` a callback URL that we forward to
 * Dropbox as the `redirect_uri`. Dropbox delivers the authorization `code`
 * to whatever host that URL points at, so if the origin is ever
 * attacker-influenced (spoofed Host header, an injected query/redirect
 * param, a misconfigured route) the code — and the access token minted
 * from it — leaks to that host.
 *
 * We close this by refusing any `redirect_uri` whose host isn't one of our
 * own domains (or a subdomain of one): decocms.com, deco.site (production
 * hosting) or deco.host (local-dev tunnel domain, cloudflared-style, needed
 * to test OAuth flows against providers that reject http://localhost
 * redirect URIs). Loopback hosts are allowed over http for local dev
 * (RFC 8252 §7.3); everything else must be https.
 */

export const ALLOWED_REDIRECT_HOST_SUFFIXES = [
  "decocms.com",
  "deco.site",
  "deco.host",
] as const;

const LOOPBACK_HOSTS = new Set(["localhost", "127.0.0.1", "[::1]", "::1"]);

/** Returns true if `redirectUri` is a well-formed URL pointing at an allowed host. */
export function isAllowedRedirectUri(redirectUri: string): boolean {
  let url: URL;
  try {
    url = new URL(redirectUri);
  } catch {
    return false;
  }

  const host = url.hostname.toLowerCase();
  const isLoopback = LOOPBACK_HOSTS.has(host);

  // https everywhere; http only for loopback dev hosts.
  if (url.protocol === "https:") {
    // ok
  } else if (url.protocol === "http:" && isLoopback) {
    return true;
  } else {
    return false;
  }

  if (isLoopback) return true;

  // `endsWith(".decocms.com")` enforces a label boundary, so "evildecocms.com"
  // and "decocms.com.attacker.io" are both rejected.
  return ALLOWED_REDIRECT_HOST_SUFFIXES.some(
    (suffix) => host === suffix || host.endsWith(`.${suffix}`),
  );
}

/** Throws if `redirectUri` is not on the allowlist. */
export function assertAllowedRedirectUri(redirectUri: string): void {
  if (!isAllowedRedirectUri(redirectUri)) {
    throw new Error(
      `Refusing OAuth redirect_uri outside the allowed domains ` +
        `(${ALLOWED_REDIRECT_HOST_SUFFIXES.join(", ")}): ${redirectUri}`,
    );
  }
}
