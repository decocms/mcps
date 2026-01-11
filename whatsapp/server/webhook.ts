import { publishEvent } from "./events";
import { WhatsAppAPIClient } from "./lib/client";
import { WebhookPayload } from "./lib/types";
import { Env } from "./main";
import { getRedisClient } from "./lib/kv.ts";

export function handleChallenge(req: Request) {
  const url = new URL(req.url);
  const mode = url.searchParams.get("hub.mode");
  const challenge = url.searchParams.get("hub.challenge");
  if (mode === "subscribe" && challenge) {
    return new Response(challenge, { status: 200 });
  }
  return new Response("Forbidden", { status: 403 });
}

export interface WhatsAppConnectionConfig {
  organizationId: string;
  callbackUrl: string | null;
  complete: boolean;
}

async function getSenderConfig(
  sender: string,
): Promise<WhatsAppConnectionConfig | null> {
  const redis = getRedisClient();
  const config = (await redis.get(
    `whatsapp:config:${sender}`,
  )) as WhatsAppConnectionConfig;
  return config ?? null;
}

export async function setSenderConfig(
  sender: string,
  config: WhatsAppConnectionConfig,
) {
  const redis = getRedisClient();
  await redis.set(`whatsapp:config:${sender}`, config);
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

async function getCallbackUrl(code: string) {
  const redis = getRedisClient();
  const callbackUrl = (await redis.get(
    `whatsapp:callback_url:${code}`,
  )) as string;
  return callbackUrl;
}

async function handleVerifyCode({
  from,
  phoneNumberId,
  text,
}: {
  from: string;
  phoneNumberId: string;
  text: string;
}) {
  const whatsappClient = new WhatsAppAPIClient();
  const code = text.split(":")[1];
  const callbackUrl = await getCallbackUrl(code);
  if (!callbackUrl) {
    return whatsappClient.sendTextMessage(phoneNumberId, from, "Invalid code");
  }
  await whatsappClient.sendCallToActionMessage({
    phoneNumberId,
    to: from,
    url: callbackUrl + "&code=" + from,
    text: "Click here to connect Deco Mesh to WhatsApp",
    cta_display_text: "Connect",
  });
}

export async function handleWebhook(payload: WebhookPayload, env: Env) {
  if (!isTextMessage(payload)) return;
  const { from, phoneNumberId, text } = getTextMessage(payload);
  const whatsappClient = new WhatsAppAPIClient();
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

  const config = await getSenderConfig(from);
  if (!config) {
    return whatsappClient.sendTextMessage(
      phoneNumberId,
      from,
      "You are not authorized to use this bot",
    );
  }

  await publishEvent(env, {
    type: "waba.text.message",
    data: payload,
    organizationId: config.organizationId,
  });
}
