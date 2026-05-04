/**
 * Gmail Webhook HTTP Handler
 *
 * Receives Google Pub/Sub push notifications for Gmail mailbox changes
 * and delivers them to the correct connection via the Mesh trigger
 * callback URL stored in `triggers:${connectionId}`.
 *
 * Authentication: Pub/Sub push subscriptions must be configured with
 * `?token=<GMAIL_WEBHOOK_SECRET>` as a query parameter; we reject
 * unauthorized requests before reading the body.
 *
 * Delivery semantics: matches the github MCP — direct fetch to the Mesh
 * callback URL, awaited via `ctx.waitUntil` so the in-flight request
 * survives the worker response. Pub/Sub will retry on non-2xx, so we
 * acknowledge ASAP and let the callback run in the background.
 */

import { getConnectionForEmail } from "./lib/email-connection-map.ts";
import type { Env } from "./types/env.ts";

interface PubSubPushMessage {
  message: {
    data: string;
    messageId: string;
    publishTime: string;
  };
  subscription: string;
}

interface GmailNotification {
  emailAddress: string;
  historyId: string;
}

interface CallbackCredentials {
  callbackUrl: string;
  callbackToken: string;
}

interface TriggerState {
  credentials: CallbackCredentials;
  activeTriggerTypes: string[];
}

async function deliverToMesh(
  env: Env,
  connectionId: string,
  type: string,
  data: Record<string, unknown>,
  deliveryId: string,
): Promise<void> {
  if (!env.EMAIL_MAP) {
    console.warn(
      `[Webhook] ⚠ delivery=${deliveryId} no EMAIL_MAP binding — skipping mesh notify`,
    );
    return;
  }

  const raw = await env.EMAIL_MAP.get(`triggers:${connectionId}`);
  if (!raw) {
    console.log(
      `[Webhook] ⚠ delivery=${deliveryId} no trigger credentials for connection=${connectionId} — skipping mesh notify`,
    );
    return;
  }

  let state: TriggerState;
  try {
    state = JSON.parse(raw) as TriggerState;
  } catch (err) {
    console.error(
      `[Webhook] ✗ delivery=${deliveryId} corrupted trigger state for connection=${connectionId}:`,
      err,
    );
    return;
  }

  try {
    const res = await fetch(state.credentials.callbackUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${state.credentials.callbackToken}`,
      },
      body: JSON.stringify({ type, data }),
    });
    if (!res.ok) {
      console.error(
        `[Webhook] ✗ delivery=${deliveryId} mesh callback returned ${res.status} ${res.statusText}`,
      );
    } else {
      console.log(
        `[Webhook] ✓ delivery=${deliveryId} mesh callback delivered (${res.status})`,
      );
    }
  } catch (err) {
    console.error(
      `[Webhook] ✗ delivery=${deliveryId} mesh callback fetch failed:`,
      err,
    );
  }
}

export async function handleGmailWebhook(
  req: Request,
  env: Env,
  ctx: ExecutionContext,
): Promise<Response> {
  const webhookSecret = process.env.GMAIL_WEBHOOK_SECRET || "";

  if (webhookSecret) {
    const url = new URL(req.url);
    const token = url.searchParams.get("token");
    if (token !== webhookSecret) {
      console.warn(`[Webhook] ✗ rejected: invalid or missing token`);
      return Response.json({ error: "Unauthorized" }, { status: 401 });
    }
  }

  let body: PubSubPushMessage;
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const deliveryId = body.message?.messageId || "unknown";

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

  if (!env.EMAIL_MAP) {
    console.error(
      `[Webhook] ✗ delivery=${deliveryId} EMAIL_MAP binding missing — wrangler.toml not deployed?`,
    );
    return Response.json({ error: "Misconfigured worker" }, { status: 500 });
  }

  const connectionId = await getConnectionForEmail(env.EMAIL_MAP, emailAddress);
  if (!connectionId) {
    console.log(
      `[Webhook] ⚠ delivery=${deliveryId} no mapping for ${emailAddress} — skipping`,
    );
    return Response.json({ ok: true, skipped: "no_mapping" });
  }

  const eventType = "gmail.message.received";

  console.log(
    `[Webhook] → delivery=${deliveryId} event=${eventType} ` +
      `email=${emailAddress} historyId=${historyId} connection=${connectionId}`,
  );

  ctx.waitUntil(
    deliverToMesh(
      env,
      connectionId,
      eventType,
      {
        event: eventType,
        emailAddress,
        historyId,
      },
      deliveryId,
    ),
  );

  return Response.json({ ok: true, event: eventType });
}
