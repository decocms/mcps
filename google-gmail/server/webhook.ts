/**
 * Gmail Webhook HTTP Handler
 *
 * Receives Google Pub/Sub push notifications for Gmail mailbox changes,
 * diffs the mailbox via `users.history.list` against the last historyId
 * we observed, and emits one `gmail.message.received` per messageAdded
 * INBOX entry — with from/subject/snippet metadata so the trigger is
 * actually useful.
 *
 * Authentication: Pub/Sub push subscriptions must be configured with
 * `?token=<GMAIL_WEBHOOK_SECRET>` so we can reject unauthorized requests
 * before reading the body.
 *
 * Delivery: direct fetch to the Mesh callback URL stored under
 * `triggers:${connectionId}`, awaited via `ctx.waitUntil` so in-flight
 * requests survive the worker response. Pub/Sub will retry on non-2xx,
 * so we ack ASAP and let the callback run in the background.
 */

import { getConnectionForEmail } from "./lib/email-connection-map.ts";
import {
  getMessageMetadata,
  listInboxMessagesAdded,
  type MessageMetadata,
} from "./lib/gmail-history.ts";
import { getAccessTokenForConnection } from "./lib/google-token.ts";
import { getLastHistoryId, setLastHistoryId } from "./lib/oauth-store.ts";
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

const EVENT_TYPE = "gmail.message.received";

async function loadTriggerState(
  env: Env,
  connectionId: string,
): Promise<TriggerState | null> {
  if (!env.EMAIL_MAP) return null;
  const raw = await env.EMAIL_MAP.get(`triggers:${connectionId}`);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as TriggerState;
  } catch (err) {
    console.error(
      `[Webhook] corrupted trigger state for connection=${connectionId}:`,
      err,
    );
    return null;
  }
}

async function deliverToMesh(
  state: TriggerState,
  data: Record<string, unknown>,
  deliveryId: string,
  messageId: string,
): Promise<void> {
  try {
    const res = await fetch(state.credentials.callbackUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${state.credentials.callbackToken}`,
      },
      body: JSON.stringify({ type: EVENT_TYPE, data }),
    });
    if (!res.ok) {
      console.error(
        `[Webhook] ✗ delivery=${deliveryId} message=${messageId} mesh callback returned ${res.status} ${res.statusText}`,
      );
    } else {
      console.log(
        `[Webhook] ✓ delivery=${deliveryId} message=${messageId} mesh callback delivered (${res.status})`,
      );
    }
  } catch (err) {
    console.error(
      `[Webhook] ✗ delivery=${deliveryId} message=${messageId} mesh callback fetch failed:`,
      err,
    );
  }
}

function buildEventData(
  emailAddress: string,
  meta: MessageMetadata,
): Record<string, unknown> {
  return {
    event: EVENT_TYPE,
    emailAddress,
    messageId: meta.id,
    threadId: meta.threadId,
    // `from` is the canonical key for the trigger filter — bare
    // lowercased address so mesh's strict `data.from === param.from`
    // can match `from: "alice@example.com"`. Raw header is preserved
    // as `fromHeader` for display.
    from: meta.fromAddress,
    fromHeader: meta.from,
    to: meta.to,
    subject: meta.subject,
    snippet: meta.snippet,
    date: meta.date,
    internalDate: meta.internalDate,
    labelIds: meta.labelIds,
  };
}

async function processNotification(
  env: Env,
  connectionId: string,
  emailAddress: string,
  pubsubHistoryId: string,
  deliveryId: string,
): Promise<void> {
  if (!env.EMAIL_MAP) return;

  const triggerState = await loadTriggerState(env, connectionId);
  if (!triggerState) {
    console.log(
      `[Webhook] ⚠ delivery=${deliveryId} no trigger state for connection=${connectionId} — nobody subscribed`,
    );
    return;
  }
  if (!triggerState.activeTriggerTypes.includes(EVENT_TYPE)) {
    console.log(
      `[Webhook] ⚠ delivery=${deliveryId} ${EVENT_TYPE} not active for connection=${connectionId} — skipping`,
    );
    return;
  }

  const accessToken = await getAccessTokenForConnection(
    env.EMAIL_MAP,
    connectionId,
  );
  if (!accessToken) {
    console.warn(
      `[Webhook] ⚠ delivery=${deliveryId} no access token for connection=${connectionId} — user may need to reauthenticate`,
    );
    return;
  }

  const startHistoryId = await getLastHistoryId(env.EMAIL_MAP, connectionId);
  if (!startHistoryId) {
    // First notification we've ever processed for this connection — no
    // delta to compute. Anchor on the Pub/Sub historyId so the *next*
    // notification can diff against it.
    console.log(
      `[Webhook] ⚠ delivery=${deliveryId} no startHistoryId for connection=${connectionId} — anchoring at ${pubsubHistoryId}`,
    );
    await setLastHistoryId(env.EMAIL_MAP, connectionId, pubsubHistoryId);
    return;
  }

  const result = await listInboxMessagesAdded(accessToken, startHistoryId);
  if (!result) {
    // 404 / stale — re-anchor at the Pub/Sub historyId. The user lost
    // visibility on what happened in the gap, but future events will
    // flow again.
    console.warn(
      `[Webhook] ⚠ delivery=${deliveryId} resyncing connection=${connectionId} — historyId rotated past startHistoryId`,
    );
    await setLastHistoryId(env.EMAIL_MAP, connectionId, pubsubHistoryId);
    return;
  }

  for (const { id: messageId } of result.messages) {
    const meta = await getMessageMetadata(accessToken, messageId);
    if (!meta) continue;
    // Defensive re-check: only deliver messages that are still in INBOX.
    // history.list already filters by labelId=INBOX on the *change*, but
    // a message may have been removed from INBOX by a later history
    // entry inside this same window.
    if (!meta.labelIds.includes("INBOX")) continue;

    await deliverToMesh(
      triggerState,
      buildEventData(emailAddress, meta),
      deliveryId,
      messageId,
    );
  }

  // Persist the new high-water mark. If we crash mid-processing a future
  // delivery will replay from `startHistoryId`, which yields at-least-once
  // semantics — acceptable for an inbox trigger.
  const newHistoryId = result.latestHistoryId ?? pubsubHistoryId;
  await setLastHistoryId(env.EMAIL_MAP, connectionId, newHistoryId);
}

export async function handleGmailWebhook(
  req: Request,
  env: Env,
  ctx: ExecutionContext,
): Promise<Response> {
  // Fail closed. An empty secret used to skip the check entirely, which
  // let an unauthenticated caller spoof Pub/Sub deliveries for any
  // mapped email. Treat missing secret as a deployment misconfig.
  const webhookSecret = process.env.GMAIL_WEBHOOK_SECRET || "";
  if (!webhookSecret) {
    console.error(
      "[Webhook] ✗ GMAIL_WEBHOOK_SECRET not set — refusing delivery",
    );
    return Response.json({ error: "Misconfigured worker" }, { status: 500 });
  }
  const url = new URL(req.url);
  const token = url.searchParams.get("token");
  if (token !== webhookSecret) {
    console.warn(`[Webhook] ✗ rejected: invalid or missing token`);
    return Response.json({ error: "Unauthorized" }, { status: 401 });
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
      `[Webhook] ✗ delivery=${deliveryId} EMAIL_MAP binding missing`,
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

  console.log(
    `[Webhook] → delivery=${deliveryId} email=${emailAddress} ` +
      `historyId=${historyId} connection=${connectionId}`,
  );

  // Hand processing off to the post-response queue so Pub/Sub gets a
  // fast 200 ack and the worker doesn't burn wall-clock waiting on
  // Gmail API round-trips per message.
  ctx.waitUntil(
    processNotification(env, connectionId, emailAddress, historyId, deliveryId),
  );

  return Response.json({ ok: true, event: EVENT_TYPE });
}
