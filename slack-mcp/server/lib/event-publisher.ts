/**
 * Slack Event Publisher
 *
 * Publishes Slack events via trigger callbacks for cross-MCP integration.
 * Other MCPs can subscribe to these events to react to Slack activity.
 */

import type { SlackEvent } from "./types.ts";
import { triggers } from "./trigger-store.ts";

export function publishMessageReceived(
  connectionId: string,
  event: SlackEvent,
): void {
  triggers.notify(connectionId, "slack.message.received", {
    event: "slack.message.received",
    channel_id: event.channel,
    user_id: event.user,
    text: event.text ?? "",
    ts: event.ts,
    thread_ts: event.thread_ts,
    is_dm: event.channel?.startsWith("D") || event.channel_type === "im",
    has_files: !!(event as any).files?.length,
    timestamp: new Date().toISOString(),
  });
  console.log(
    `[Triggers] Notified slack.message.received: channel=${event.channel}`,
  );
}

export function publishAppMention(
  connectionId: string,
  event: SlackEvent,
): void {
  triggers.notify(connectionId, "slack.app_mention", {
    event: "slack.app_mention",
    channel_id: event.channel,
    user_id: event.user,
    text: event.text ?? "",
    ts: event.ts,
    thread_ts: event.thread_ts,
    has_files: !!(event as any).files?.length,
    timestamp: new Date().toISOString(),
  });
  console.log(
    `[Triggers] Notified slack.app_mention: channel=${event.channel}`,
  );
}

export function publishReactionAdded(
  connectionId: string,
  event: SlackEvent,
): void {
  triggers.notify(connectionId, "slack.reaction.added", {
    event: "slack.reaction.added",
    channel_id: event.channel,
    user_id: event.user,
    reaction: (event as any).reaction,
    item_ts: (event as any).item?.ts,
    timestamp: new Date().toISOString(),
  });
  console.log(
    `[Triggers] Notified slack.reaction.added: channel=${event.channel}`,
  );
}

export function publishChannelCreated(
  connectionId: string,
  event: SlackEvent,
): void {
  triggers.notify(connectionId, "slack.channel.created", {
    event: "slack.channel.created",
    channel_id: (event as any).channel?.id ?? event.channel,
    channel_name: (event as any).channel?.name,
    timestamp: new Date().toISOString(),
  });
  console.log(`[Triggers] Notified slack.channel.created`);
}

export function publishMemberJoined(
  connectionId: string,
  event: SlackEvent,
): void {
  triggers.notify(connectionId, "slack.member.joined", {
    event: "slack.member.joined",
    channel_id: event.channel,
    user_id: event.user,
    timestamp: new Date().toISOString(),
  });
  console.log(
    `[Triggers] Notified slack.member.joined: channel=${event.channel}`,
  );
}
