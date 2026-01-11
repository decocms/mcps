import type { WebhookPayload } from "./lib/types";
import { generateResponse } from "./llm";
import type { Env } from "./main";
import { sendTextMessage } from "./tools/messages";

export async function handleTextMessageEvent(
  env: Env,
  event: { data: WebhookPayload; type: string },
) {
  try {
    const data = event.data;
    const entry = data.entry?.[0];
    const message = entry?.changes?.[0].value.messages?.[0];
    const from = message?.from;
    const text = message?.text?.body;
    const phoneNumberId = entry?.changes?.[0].value.metadata.phone_number_id;
    if (!from || !text || !phoneNumberId) {
      throw new Error("Invalid message data");
    }
    const shouldUseLLM = text.startsWith("/llm");
    let response = `Successfully received the event: ${event.type}`;
    if (shouldUseLLM) {
      return generateResponse(env, text.slice(4), from, phoneNumberId);
    }

    sendTextMessage(env, {
      phoneNumber: from,
      phoneNumberId,
      message: response,
    });
  } catch (error) {
    console.error("[WhatsApp] Webhook processing error:", error);
  }
}

export async function publishEvent(
  env: Env,
  {
    data,
    organizationId,
    type,
  }: {
    type: string;
    data: WebhookPayload;
    organizationId: string;
  },
) {
  const baseUrl = env.MESH_BASE_URL ?? process.env.MESH_BASE_URL;
  const url = new URL(`${baseUrl}/org/${organizationId}/events/${type}`);
  await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(data),
  });
}
