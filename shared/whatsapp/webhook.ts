import { WebhookPayload } from "./types";

export async function verifyWebhook({
  rawBody,
  signature,
  appSecret,
}: {
  rawBody: string;
  signature: string | null;
  appSecret: string;
}): Promise<
  | {
      verified: true;
      payload: WebhookPayload;
    }
  | {
      verified: false;
      payload: null;
    }
> {
  if (!signature) {
    console.error("[WhatsApp] Missing X-Hub-Signature-256 header");
    return { verified: false, payload: null };
  }

  const expectedPrefix = "sha256=";
  if (!signature.startsWith(expectedPrefix)) {
    console.error("[WhatsApp] Invalid signature format");
    return { verified: false, payload: null };
  }

  const providedHash = signature.slice(expectedPrefix.length);

  // Encode the app secret and body for HMAC-SHA256
  const encoder = new TextEncoder();
  const keyData = encoder.encode(appSecret);
  const messageData = encoder.encode(rawBody);

  // Import the key for HMAC
  const cryptoKey = await crypto.subtle.importKey(
    "raw",
    keyData,
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );

  // Compute the HMAC-SHA256 hash
  const signatureBuffer = await crypto.subtle.sign(
    "HMAC",
    cryptoKey,
    messageData,
  );

  // Convert to hex string
  const computedHash = Array.from(new Uint8Array(signatureBuffer))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");

  // Constant-time comparison to prevent timing attacks
  if (computedHash.length !== providedHash.length) {
    return { verified: false, payload: null };
  }

  let result = 0;
  for (let i = 0; i < computedHash.length; i++) {
    result |= computedHash.charCodeAt(i) ^ providedHash.charCodeAt(i);
  }

  const verified = result === 0;

  if (!verified) {
    return { verified, payload: null };
  }

  try {
    return { verified, payload: JSON.parse(rawBody) as WebhookPayload };
  } catch {
    console.error("[WhatsApp] Failed to parse webhook payload as JSON");
    return { verified: false, payload: null };
  }
}

export function handleChallenge(req: Request) {
  const url = new URL(req.url);
  const mode = url.searchParams.get("hub.mode");
  const challenge = url.searchParams.get("hub.challenge");
  if (mode === "subscribe" && challenge) {
    return new Response(challenge, { status: 200 });
  }
  return new Response("Forbidden", { status: 403 });
}

export interface WebhookHandlerOptions {
  appSecret: string;
  handleEvent?: (payload: WebhookPayload) => Promise<void>;
}

/**
 * Handles POST /webhook requests with signature verification
 * Returns a standard Response - wire this up to your framework of choice
 */
export async function handleWebhookPost(
  req: Request,
  options: WebhookHandlerOptions,
): Promise<Response> {
  const { appSecret, handleEvent } = options;

  const rawBody = await req.text();
  const signature = req.headers.get("X-Hub-Signature-256");

  const result = await verifyWebhook({ rawBody, signature, appSecret });
  if (!result.verified) {
    return Response.json({ error: "Invalid signature" }, { status: 401 });
  }

  await handleEvent?.(result.payload);

  return Response.json({ success: true });
}
