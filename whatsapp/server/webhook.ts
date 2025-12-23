import { publishEvent } from "./events";
import { WebhookPayload } from "./lib/types";
import { Env } from "./main";

const WEBHOOK_VERIFY_TOKEN = "random-token";

export async function handleChallenge(req: Request) {
  const url = new URL(req.url);
  const mode = url.searchParams.get("hub.mode");
  const token = url.searchParams.get("hub.verify_token");
  const challenge = url.searchParams.get("hub.challenge");
  if (mode === "subscribe" && token === WEBHOOK_VERIFY_TOKEN && challenge) {
    return new Response(challenge, { status: 200 });
  }
  return new Response("Forbidden", { status: 403 });
}

export async function handleWebhook(req: Request, env: Env) {
  try {
    const payload = (await req.json()) as WebhookPayload;
    if (!payload.entry?.[0]?.changes?.[0]?.value?.messages?.[0]?.text?.body) {
      return new Response("OK", { status: 200 });
    }

    publishEvent(env, {
      type: "waba.text.message",
      data: payload,
    });

    return new Response("OK", { status: 200 });
  } catch (error) {
    console.error("[WhatsApp] Webhook processing error:", error);
    return new Response("Error", { status: 500 });
  }
}
