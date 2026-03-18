/**
 * GitHub Webhook Signature Verification
 *
 * Verifies HMAC SHA-256 signatures from GitHub webhook payloads.
 */

export interface GitHubWebhookPayload {
  action?: string;
  installation?: { id: number; account?: { login: string } };
  repository?: { full_name: string; owner: { login: string } };
  organization?: { login: string; id: number };
  sender?: { login: string; id: number };
  [key: string]: unknown;
}

/**
 * Verify a GitHub webhook signature using HMAC SHA-256.
 *
 * GitHub sends the signature in the `x-hub-signature-256` header as `sha256=<hex>`.
 */
export async function verifyGitHubWebhook(
  rawBody: string,
  signatureHeader: string | null,
  secret: string,
): Promise<
  | { verified: true; payload: GitHubWebhookPayload }
  | { verified: false; payload: null }
> {
  if (!secret) {
    console.error(
      "[Webhook] No webhook secret configured — rejecting request. Set GITHUB_WEBHOOK_SECRET.",
    );
    return { verified: false, payload: null };
  }

  if (!signatureHeader) {
    console.warn("[Webhook] Missing x-hub-signature-256 header");
    return { verified: false, payload: null };
  }

  const prefix = "sha256=";
  if (!signatureHeader.startsWith(prefix)) {
    console.warn("[Webhook] Invalid signature format");
    return { verified: false, payload: null };
  }

  const signatureHash = signatureHeader.slice(prefix.length);

  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );

  const signatureBytes = await crypto.subtle.sign(
    "HMAC",
    key,
    encoder.encode(rawBody),
  );
  const computedHash = Array.from(new Uint8Array(signatureBytes))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");

  // Constant-time comparison
  if (computedHash.length !== signatureHash.length) {
    return { verified: false, payload: null };
  }

  let result = 0;
  for (let i = 0; i < computedHash.length; i++) {
    result |= computedHash.charCodeAt(i) ^ signatureHash.charCodeAt(i);
  }

  if (result !== 0) {
    return { verified: false, payload: null };
  }

  try {
    return { verified: true, payload: JSON.parse(rawBody) };
  } catch {
    return { verified: false, payload: null };
  }
}
