/**
 * Publishes Teams events to the trigger system so subscribed agents react.
 */

import { triggers } from "./trigger-store.ts";
import type { GraphMessage } from "./graph-client.ts";

/** Strip HTML tags from Graph message body when contentType is html. */
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

export function publishMessageReceived(
  connectionId: string,
  teamId: string,
  channelId: string,
  message: GraphMessage,
): void {
  const senderId =
    message.from?.user?.id ?? message.from?.application?.id ?? "unknown";
  const senderName =
    message.from?.user?.displayName ??
    message.from?.application?.displayName ??
    "Unknown";
  const text = toPlainText(message.body);

  triggers.notify(connectionId, "teams.message.received", {
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
      ? `To reply in this thread call TEAMS_REPLY_TO_MESSAGE with team_id="${teamId}", channel_id="${channelId}", message_id="${message.replyToId ?? message.id}".`
      : `To reply call TEAMS_REPLY_TO_MESSAGE with team_id="${teamId}", channel_id="${channelId}", message_id="${message.id}".`,
  });

  console.log(
    `[Teams Triggers] Notified teams.message.received: channel=${channelId} sender=${senderName}`,
  );
}
