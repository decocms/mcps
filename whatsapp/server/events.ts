import type { WebhookPayload } from "./lib/types";
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
    sendTextMessage(env, {
      phoneNumber: from,
      phoneNumberId,
      message: "You said: " + text,
    });
  } catch (error) {
    console.error("[WhatsApp] Webhook processing error:", error);
  }
}

export function publishEvent(
  env: Env,
  {
    type,
    data,
  }: {
    type: string;
    data: WebhookPayload;
  },
) {
  const apiKey = env.MESH_API_KEY;
  const connId = "self";
  const baseUrl = env.MESH_BASE_URL;
  fetch(`${baseUrl}/mcp/${connId}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json, text/event-stream",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      jsonrpc: "2.0",
      method: "tools/call",
      params: {
        name: "EVENT_PUBLISH",
        arguments: {
          type,
          data,
        },
      },
      id: 1,
    }),
  }).catch((error) => {
    console.error("[WhatsApp] Webhook processing error:", error);
    return new Response("Error", { status: 500 });
  });
}
