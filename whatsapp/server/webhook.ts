import { publishEvent } from "./events";
import { getWhatsappClient } from "./lib/whatsapp-client";
import { WebhookPayload } from "./lib/types";
import { readCallbackUrl, readSenderConfig, saveAuthToken } from "./lib/data";
import { env } from "./env";

/**
 * Verifies the webhook signature from Meta using HMAC-SHA256.
 *
 * @param rawBody - The raw request body as a string
 * @param signature - The X-Hub-Signature-256 header value (format: "sha256=<hash>")
 * @returns true if the signature is valid, false otherwise
 */
export async function verifyWebhook(
  rawBody: string,
  signature: string | null,
): Promise<
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
  const keyData = encoder.encode(env.META_APP_SECRET);
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

const isTextMessage = (payload: WebhookPayload) => {
  return !!payload.entry?.[0]?.changes?.[0]?.value?.messages?.[0]?.text?.body;
};

const getTextMessage = (payload: WebhookPayload) => {
  const from = payload.entry?.[0]?.changes?.[0]?.value?.messages?.[0]?.from;
  const phoneNumberId =
    payload.entry?.[0]?.changes?.[0]?.value?.metadata?.phone_number_id;
  const text =
    payload.entry?.[0]?.changes?.[0]?.value?.messages?.[0]?.text?.body;
  if (!from || !phoneNumberId || !text) {
    throw new Error("Invalid message data");
  }
  return { from, phoneNumberId, text };
};

async function handleVerifyCode({
  from,
  phoneNumberId,
  text,
}: {
  from: string;
  phoneNumberId: string;
  text: string;
}) {
  const whatsappClient = getWhatsappClient();
  const code = text.split(":")[1];
  const callbackUrl = await readCallbackUrl(code);
  if (!callbackUrl) {
    return whatsappClient.sendTextMessage({
      phoneNumberId,
      to: from,
      message: "Invalid code",
    });
  }

  // Generate auth token instead of using phone number directly
  const authToken = crypto.randomUUID();
  await saveAuthToken(authToken, from);

  // Properly construct URL with code parameter
  const redirectUrl = new URL(callbackUrl);
  redirectUrl.searchParams.set("code", authToken);

  await whatsappClient.sendCallToActionMessage({
    phoneNumberId,
    to: from,
    url: redirectUrl.toString(),
    text: "Just a few more steps.",
    cta_display_text: "Head to Mesh",
  });
}

export async function handleVerifiedWebhookPayload(payload: WebhookPayload) {
  if (!isTextMessage(payload)) return;
  const { from, phoneNumberId, text } = getTextMessage(payload);
  const whatsappClient = getWhatsappClient();
  const messageId = payload.entry?.[0]?.changes?.[0]?.value?.messages?.[0]?.id;
  if (!messageId) {
    throw new Error("Message ID is required");
  }

  whatsappClient
    .markMessageAsRead({
      phoneNumberId,
      messageId,
      showTypingIndicator: true,
    })
    .catch((error) => {
      console.error("[WhatsApp] Error marking message as read:", error);
    });

  if (text.includes("[VERIFY_CODE]")) {
    return handleVerifyCode({ from, phoneNumberId, text });
  }

  const config = await readSenderConfig(from);
  if (!config) {
    return getWhatsappClient().sendTextMessage({
      phoneNumberId,
      to: from,
      message: "You are not authorized to use this bot",
    });
  }

  await publishEvent({
    type: "waba.text.message",
    data: payload,
    organizationId: config.organizationId,
  });
}
