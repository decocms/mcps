/**
 * Publishes Teams events to subscribed Mesh automations.
 *
 * On Cloudflare Workers we cannot rely on the runtime's `triggers.notify()`
 * because it delivers the callback via a floating, non-awaitable promise that
 * the isolate cancels once the webhook response returns. Instead we read the
 * trigger credentials from KV and `await` the callback fetch ourselves — the
 * caller wraps the whole thing in `ctx.waitUntil()` (the github MCP pattern).
 */

import type { GraphMessage } from "./graph-client.ts";
import { getKvStore } from "./kv.ts";
import { logEvent } from "./event-log.ts";
import { logger } from "./logger.ts";

interface TriggerState {
  credentials?: { callbackUrl: string; callbackToken: string };
  activeTriggerTypes?: string[];
}

/** Strip HTML tags from a Graph message body when contentType is html. */
function toPlainText(body: GraphMessage["body"]): string {
  if (body.contentType === "text") return body.content;
  return body.content
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/p>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&")
    .trim();
}

/**
 * Deliver a trigger event to the Mesh callback registered for this connection.
 * Reads `triggers:{connectionId}` from KV (written by the TRIGGER_CONFIGURE
 * tool) and POSTs to the callback URL. Awaitable so the caller can keep the
 * Worker isolate alive via ctx.waitUntil().
 */
async function deliverToMesh(
  connectionId: string,
  type: string,
  data: Record<string, unknown>,
  trace_id?: string,
): Promise<void> {
  const state = await getKvStore().get<TriggerState>(
    `triggers:${connectionId}`,
  );

  if (!state?.credentials?.callbackUrl) {
    logger.info("No trigger credentials — skipping notify", {
      connectionId,
      trace_id,
      event_type: type,
    });
    return;
  }

  if (state.activeTriggerTypes && !state.activeTriggerTypes.includes(type)) {
    logger.debug("Trigger type not active — skipping notify", {
      connectionId,
      trace_id,
      event_type: type,
    });
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
      logger.error("Mesh callback delivery failed", {
        connectionId,
        trace_id,
        event_type: type,
        status: res.status,
      });
    }
  } catch (err) {
    logger.error("Mesh callback fetch failed", {
      connectionId,
      trace_id,
      event_type: type,
      error: String(err),
    });
  }
}

export async function publishMessageReceived(
  connectionId: string,
  teamId: string,
  channelId: string,
  message: GraphMessage,
  trace_id?: string,
): Promise<void> {
  const senderId =
    message.from?.user?.id ?? message.from?.application?.id ?? "unknown";
  const senderName =
    message.from?.user?.displayName ??
    message.from?.application?.displayName ??
    "Unknown";
  const text = toPlainText(message.body);

  const payload = {
    event: "teams.message.received",
    team_id: teamId,
    channel_id: channelId,
    message_id: message.id,
    text,
    sender_id: senderId,
    sender_name: senderName,
    reply_to_id: message.replyToId ?? null,
    web_url: message.webUrl ?? null,
    created_at: message.createdDateTime,
    timestamp: new Date().toISOString(),
    reply_instruction: message.replyToId
      ? `To reply in this thread call REPLY_TO_MESSAGE with team_id="${teamId}", channel_id="${channelId}", message_id="${message.replyToId ?? message.id}".`
      : `To reply call REPLY_TO_MESSAGE with team_id="${teamId}", channel_id="${channelId}", message_id="${message.id}".`,
  };

  // Awaited so ctx.waitUntil() keeps the isolate alive until delivery completes.
  await deliverToMesh(
    connectionId,
    "teams.message.received",
    payload,
    trace_id,
  );
  await logEvent(connectionId, "teams.message.received", payload, trace_id);

  logger.info("Trigger notified", {
    connectionId,
    trace_id,
    event_type: "teams.message.received",
    channelId,
    sender: senderName,
  });
}
