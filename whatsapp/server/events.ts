import { env } from "./env";
import type { WebhookPayload } from "./lib/types";
import { generateResponse } from "./llm";
import type { RuntimeEnv } from "./main";

export async function handleTextMessageEvent(
  env: RuntimeEnv,
  event: { data: WebhookPayload; type: string },
) {
  try {
    const data = event.data;
    const entry = data.entry?.[0];
    const message = entry?.changes?.[0]?.value?.messages?.[0];
    const from = message?.from;
    const text = message?.text?.body;
    const phoneNumberId = entry?.changes?.[0]?.value?.metadata?.phone_number_id;
    const messageId = message?.id;
    if (!from || !text || !phoneNumberId || !messageId) {
      throw new Error("Invalid message data");
    }
    return generateResponse(env, text, from, phoneNumberId, messageId);
  } catch (error) {
    console.error("[WhatsApp] Webhook processing error:", error);
  }
}

export async function publishEvent({
  data,
  organizationId,
  type,
}: {
  type: string;
  data: WebhookPayload;
  organizationId: string;
}) {
  const meshUrl = env.MESH_URL;
  const url = new URL(`${meshUrl}/org/${organizationId}/events/${type}`);
  const response = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(data),
  });

  if (!response.ok) {
    const errorText = await response.text().catch(() => "");
    throw new Error(
      `Failed to publish event to mesh (${response.status}): ${errorText || response.statusText}`,
    );
  }
}
