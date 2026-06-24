/**
 * Webhook auth for the Google Apps Script → calendar bridge.
 *
 * The Apps Script (running in each user's Google account) has no Google-issued
 * signing secret — it's our own script. So we mint a per-connection token by
 * HMAC-ing the connectionId with a server-wide secret (SERVER_SECRET). The
 * `get_apps_script_config` tool hands this token to the user; the router below
 * recomputes it and compares constant-time. No extra storage for the token.
 */

function getServerSecret(): string {
  const secret = process.env.SERVER_SECRET;
  if (!secret) {
    throw new Error(
      "SERVER_SECRET is not set — cannot mint/verify webhook tokens",
    );
  }
  return secret;
}

async function hmacHex(message: string, secret: string): Promise<string> {
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const sig = await crypto.subtle.sign("HMAC", key, encoder.encode(message));
  return Array.from(new Uint8Array(sig))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

/** Deterministic per-connection webhook token (hex HMAC of the connectionId). */
export function computeWebhookToken(connectionId: string): Promise<string> {
  return hmacHex(connectionId, getServerSecret());
}

/** Constant-time verification of a presented token for a connection. */
export async function verifyWebhookToken(
  connectionId: string,
  presented: string | null,
): Promise<boolean> {
  if (!presented) return false;

  let expected: string;
  try {
    expected = await computeWebhookToken(connectionId);
  } catch (error) {
    console.error("[Calendar Webhook] Cannot verify token:", error);
    return false;
  }

  if (expected.length !== presented.length) return false;

  let result = 0;
  for (let i = 0; i < expected.length; i++) {
    result |= expected.charCodeAt(i) ^ presented.charCodeAt(i);
  }
  return result === 0;
}

/** Extract a bearer token from the Authorization header. */
export function bearerToken(header: string | null | undefined): string | null {
  if (!header) return null;
  return header.startsWith("Bearer ") ? header.slice(7) : header;
}
