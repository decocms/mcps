/**
 * Gmail Webhook HTTP Handler
 *
 * Receives Google Pub/Sub push notifications for Gmail mailbox changes
 * and routes them to the correct connection via triggers.notify().
 *
 * Authentication: Pub/Sub push subscriptions should be configured with
 * ?token=<GMAIL_WEBHOOK_SECRET> as a query parameter. This handler
 * validates the token before processing.
 */

import { getConnectionForEmail } from "./lib/email-connection-map.ts";
import { triggers } from "./lib/trigger-store.ts";

interface PubSubPushMessage {
  message: {
    data: string; // base64-encoded JSON: { emailAddress, historyId }
    messageId: string;
    publishTime: string;
  };
  subscription: string;
}

interface GmailNotification {
  emailAddress: string;
  historyId: string;
}

export async function handleGmailWebhook(
  req: Request,
  kv: KVNamespace,
  webhookSecret: string,
): Promise<Response> {
  if (webhookSecret) {
    const url = new URL(req.url);
    const token = url.searchParams.get("token");
    if (token !== webhookSecret) {
      return Response.json({ error: "Unauthorized" }, { status: 401 });
    }
  }

  let body: PubSubPushMessage;
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: "Invalid JSON" }, { status: 400 });
  }

  if (!body.message?.data) {
    return Response.json({ error: "Missing message data" }, { status: 400 });
  }

  let notification: GmailNotification;
  try {
    const decoded = atob(body.message.data);
    notification = JSON.parse(decoded);
  } catch {
    return Response.json(
      { error: "Invalid notification data" },
      { status: 400 },
    );
  }

  const { emailAddress, historyId } = notification;
  if (!emailAddress) {
    return Response.json({ ok: true, skipped: "no_email_address" });
  }

  const connectionId = await getConnectionForEmail(kv, emailAddress);
  if (!connectionId) {
    console.log(
      `[Gmail Webhook] No connection mapping for ${emailAddress}, skipping`,
    );
    return Response.json({ ok: true, skipped: "no_mapping" });
  }

  console.log(
    `[Gmail Webhook] Notification for ${emailAddress} (historyId: ${historyId}) → connection ${connectionId}`,
  );

  triggers.notify(connectionId, "gmail.message.received", {
    event: "gmail.message.received",
    emailAddress,
    historyId,
  });

  return Response.json({ ok: true, event: "gmail.message.received" });
}
