import { publishEvent } from "./events";
import { getWhatsappClient } from "./lib/whatsapp-client";
import { WebhookPayload } from "./lib/types";
import { readCallbackUrl, readSenderConfig } from "./lib/data";

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
  await whatsappClient.sendCallToActionMessage({
    phoneNumberId,
    to: from,
    url: callbackUrl + "&code=" + from,
    text: "Click here to connect Deco Mesh to WhatsApp",
    cta_display_text: "Connect",
  });
}

export async function handleWebhook(payload: WebhookPayload) {
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
