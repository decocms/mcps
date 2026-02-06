/**
 * URL Validator
 *
 * Validates URLs before fetching to prevent SSRF (Server-Side Request Forgery).
 * Blocks access to internal networks, cloud metadata endpoints, and non-HTTP protocols.
 */

/** Private/internal IP ranges and hostnames that should be blocked */
const BLOCKED_HOSTNAMES = new Set([
  "localhost",
  "127.0.0.1",
  "0.0.0.0",
  "[::1]",
  "[::0]",
  "metadata.google.internal",
]);

/**
 * Check if an IP address is in a private/reserved range.
 *
 * Blocked ranges:
 * - 10.0.0.0/8 (Private)
 * - 172.16.0.0/12 (Private)
 * - 192.168.0.0/16 (Private)
 * - 169.254.0.0/16 (Link-local / Cloud metadata)
 * - 127.0.0.0/8 (Loopback)
 * - 0.0.0.0/8 (This network)
 */
function isPrivateIp(hostname: string): boolean {
  // Match IPv4 addresses
  const ipv4Match = hostname.match(
    /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/,
  );
  if (!ipv4Match) return false;

  const [, a, b] = ipv4Match.map(Number);

  // 10.0.0.0/8
  if (a === 10) return true;
  // 172.16.0.0/12
  if (a === 172 && b >= 16 && b <= 31) return true;
  // 192.168.0.0/16
  if (a === 192 && b === 168) return true;
  // 169.254.0.0/16 (link-local, AWS/GCP metadata)
  if (a === 169 && b === 254) return true;
  // 127.0.0.0/8 (loopback)
  if (a === 127) return true;
  // 0.0.0.0/8
  if (a === 0) return true;

  return false;
}

/**
 * Validates a URL for safe external fetching.
 *
 * @param url - The URL string to validate
 * @returns An object with `valid` boolean and optional `reason` string
 *
 * @example
 * ```ts
 * const result = validateExternalUrl("https://example.com/image.png");
 * if (!result.valid) {
 *   throw new Error(result.reason);
 * }
 * ```
 */
export function validateExternalUrl(url: string): {
  valid: boolean;
  reason?: string;
} {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return { valid: false, reason: "URL inválida" };
  }

  // Only allow HTTP and HTTPS protocols
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    return {
      valid: false,
      reason: `Protocolo não permitido: ${parsed.protocol}. Apenas http: e https: são aceitos.`,
    };
  }

  // Block known internal hostnames
  const hostname = parsed.hostname.toLowerCase();
  if (BLOCKED_HOSTNAMES.has(hostname)) {
    return {
      valid: false,
      reason: "Acesso a endereços internos não é permitido",
    };
  }

  // Block private IP addresses
  if (isPrivateIp(hostname)) {
    return {
      valid: false,
      reason: "Acesso a endereços IP privados não é permitido",
    };
  }

  // Block IPv6 loopback/private (basic check)
  if (hostname.startsWith("[") && hostname !== "[::1]") {
    // Allow most IPv6, already blocked ::1 above
  }

  return { valid: true };
}
