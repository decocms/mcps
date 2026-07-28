/**
 * Stateless token helpers for the Shopify OAuth flow.
 *
 * Two primitives, both keyed off a single shared secret (SHOPIFY_TOKEN_SECRET):
 *
 *  - `signState` / `verifyState`  — HMAC-signed (integrity only) blobs used to
 *    carry the mesh callback URL through Shopify's `state` round-trip. The value
 *    isn't secret, it just must not be tampered with.
 *
 *  - `encryptCredential` / `decryptCredential` — AES-256-GCM sealed blobs that
 *    hold `{ shop, token }`. This becomes the connection's access token, so it
 *    travels back through a browser redirect; encrypting (not just signing)
 *    keeps the Shopify Admin API token unreadable in URLs, history and logs.
 *
 * Plus `verifyShopifyHmac`, which validates the HMAC Shopify appends to the
 * OAuth callback query so we only trust genuine Shopify redirects.
 */
import {
  createCipheriv,
  createDecipheriv,
  createHash,
  createHmac,
  randomBytes,
  timingSafeEqual,
} from "node:crypto";

const IV_BYTES = 12;
const TAG_BYTES = 16;

/** The `{ shop, token }` pair sealed into an OAuth connection's access token. */
export interface SealedCredential {
  shop: string;
  token: string;
}

/** The shared secret used to seal/open credentials and sign state. */
export function getTokenSecret(): string {
  return process.env.SHOPIFY_TOKEN_SECRET || "";
}

/** Derive a stable 32-byte AES key from the shared secret. */
function keyFrom(secret: string): Buffer {
  return createHash("sha256").update(secret).digest();
}

function safeEqual(a: string, b: string): boolean {
  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);
  return bufA.length === bufB.length && timingSafeEqual(bufA, bufB);
}

// ── Signed state (integrity only) ────────────────────────────────────────────

export function signState(payload: unknown, secret: string): string {
  const body = Buffer.from(JSON.stringify(payload), "utf8").toString(
    "base64url",
  );
  const sig = createHmac("sha256", secret).update(body).digest("base64url");
  return `${body}.${sig}`;
}

export function verifyState<T>(token: string, secret: string): T | null {
  const dot = token.lastIndexOf(".");
  if (dot < 0) return null;
  const body = token.slice(0, dot);
  const sig = token.slice(dot + 1);
  const expected = createHmac("sha256", secret)
    .update(body)
    .digest("base64url");
  if (!safeEqual(sig, expected)) return null;
  try {
    return JSON.parse(Buffer.from(body, "base64url").toString("utf8")) as T;
  } catch {
    return null;
  }
}

// ── Sealed credential (confidentiality + integrity) ──────────────────────────

export function encryptCredential(payload: unknown, secret: string): string {
  const iv = randomBytes(IV_BYTES);
  const cipher = createCipheriv("aes-256-gcm", keyFrom(secret), iv);
  const plaintext = Buffer.from(JSON.stringify(payload), "utf8");
  const ciphertext = Buffer.concat([cipher.update(plaintext), cipher.final()]);
  const tag = cipher.getAuthTag();
  return Buffer.concat([iv, tag, ciphertext]).toString("base64url");
}

export function decryptCredential<T>(token: string, secret: string): T | null {
  try {
    const raw = Buffer.from(token, "base64url");
    if (raw.length <= IV_BYTES + TAG_BYTES) return null;
    const iv = raw.subarray(0, IV_BYTES);
    const tag = raw.subarray(IV_BYTES, IV_BYTES + TAG_BYTES);
    const ciphertext = raw.subarray(IV_BYTES + TAG_BYTES);
    const decipher = createDecipheriv("aes-256-gcm", keyFrom(secret), iv);
    decipher.setAuthTag(tag);
    const plaintext = Buffer.concat([
      decipher.update(ciphertext),
      decipher.final(),
    ]);
    return JSON.parse(plaintext.toString("utf8")) as T;
  } catch {
    return null;
  }
}

// ── Shopify callback HMAC ─────────────────────────────────────────────────────

/**
 * Verify the `hmac` Shopify appends to OAuth redirects. Per Shopify's spec:
 * drop `hmac`/`signature`, sort the remaining params, join as `k=v` with `&`,
 * and HMAC-SHA256 with the app's client secret.
 * See https://shopify.dev/docs/apps/auth/oauth/getting-started#step-3-validate-the-authorization-code
 */
export function verifyShopifyHmac(
  params: URLSearchParams,
  clientSecret: string,
): boolean {
  const hmac = params.get("hmac");
  if (!hmac) return false;
  const entries: string[] = [];
  for (const [key, value] of params) {
    if (key === "hmac" || key === "signature") continue;
    entries.push(`${key}=${value}`);
  }
  entries.sort();
  const digest = createHmac("sha256", clientSecret)
    .update(entries.join("&"))
    .digest("hex");
  return safeEqual(digest, hmac);
}
