/**
 * Slack Event Publisher
 *
 * Publishes Slack events via trigger callbacks for cross-MCP integration.
 * Other MCPs can subscribe to these events to react to Slack activity.
 *
 * For message-style events (`slack.message.received` and `slack.app_mention`)
 * we enrich the payload with:
 * - `user_name`: the resolved Slack display name of the author, so the
 *   subscriber doesn't have to call SLACK_GET_USER_INFO just to address
 *   the user properly.
 * - `thread_messages`: when the incoming event lives in a thread, the
 *   full set of replies from that thread (oldest → newest, including the
 *   parent and the bot's own prior replies). Lets a trigger-driven agent
 *   see the entire conversation in one shot and answer coherently with
 *   SLACK_REPLY_IN_THREAD without having to fetch history itself.
 */

import type { SlackEvent } from "./types.ts";
import { triggers } from "./trigger-store.ts";
import { getThreadReplies, getUserInfo } from "./slack-client.ts";

interface ThreadMessageSummary {
  ts: string;
  user?: string;
  text: string;
  is_bot: boolean;
}

async function resolveUserName(
  userId: string | undefined,
): Promise<string | undefined> {
  if (!userId) return undefined;
  try {
    const info = await getUserInfo(userId);
    return (
      info?.profile?.display_name || info?.real_name || info?.name || undefined
    );
  } catch {
    return undefined;
  }
}

async function fetchThreadMessages(
  channel: string | undefined,
  threadTs: string | undefined,
): Promise<ThreadMessageSummary[] | undefined> {
  // Top-level messages (no thread_ts) do NOT pay this RTT — only thread
  // continuations fetch history. Returning undefined here also avoids
  // hitting Slack's conversations.replies when there is nothing to fetch.
  if (!channel || !threadTs) return undefined;
  try {
    const replies = await getThreadReplies(channel, threadTs);
    return replies
      .sort((a, b) => Number.parseFloat(a.ts) - Number.parseFloat(b.ts))
      .map((m) => ({
        ts: m.ts,
        user: m.user,
        text: m.text ?? "",
        is_bot: Boolean(m.bot_id),
      }));
  } catch {
    return undefined;
  }
}

/**
 * The thread_ts the agent must use when replying.
 *
 * - If the user message is already inside a thread → that thread's ts.
 * - If the user message is top-level → its own ts, which starts a new
 *   thread under it (Slack's "first reply with thread_ts=parent" rule).
 *
 * Pre-computing this on the publisher side guarantees that the agent
 * NEVER has to decide whether to start or continue a thread — every
 * reply is anchored to a single thread per subject.
 */
function replyInThreadTs(event: SlackEvent): string | undefined {
  return event.thread_ts ?? event.ts;
}

/**
 * Reply instruction baked into the trigger payload so a trigger-driven
 * agent knows exactly how to respond without prompt engineering on the
 * subscriber side.
 *
 * When a "Pensando..." placeholder is already in the thread (thinkingTs
 * present), we want the agent to EDIT it instead of stacking another
 * message — keeps the thread clean (one final message per turn).
 */
function buildReplyInstruction(
  channelId: string | undefined,
  threadTs: string | undefined,
  thinkingTs: string | undefined,
): string {
  if (thinkingTs) {
    return [
      "A 'Pensando...' placeholder is already in the thread. To respond:",
      "  Call SLACK_EDIT_MESSAGE with:",
      `    channel = "${channelId ?? ""}"`,
      `    ts = "${thinkingTs}"`,
      "    text = <your final answer>",
      "This replaces the placeholder with the answer in place, keeping the",
      "thread free of bot clutter.",
    ].join("\n");
  }
  return [
    "When you respond, ALWAYS call the SLACK_REPLY_IN_THREAD tool with:",
    `  channel = "${channelId ?? ""}"`,
    `  thread_ts = "${threadTs ?? ""}"`,
    "Never send a top-level message — every reply must live in this thread",
    "so each subject stays isolated.",
  ].join("\n");
}

export interface PublishExtras {
  /** Marks this notification as fired from a fallback path. */
  fallback?: boolean;
  /**
   * ts of the "Pensando..." placeholder the agent should edit with its
   * final answer (via SLACK_EDIT_MESSAGE). When omitted, the agent should
   * post a fresh reply via SLACK_REPLY_IN_THREAD.
   */
  thinking_message_ts?: string;
}

export async function publishMessageReceived(
  connectionId: string,
  event: SlackEvent,
  extras?: PublishExtras,
): Promise<void> {
  const [user_name, thread_messages] = await Promise.all([
    resolveUserName(event.user),
    fetchThreadMessages(event.channel, event.thread_ts),
  ]);

  const reply_in_thread_ts = replyInThreadTs(event);

  triggers.notify(connectionId, "slack.message.received", {
    event: "slack.message.received",
    channel_id: event.channel,
    user_id: event.user,
    user_name,
    text: event.text ?? "",
    ts: event.ts,
    thread_ts: event.thread_ts,
    reply_in_thread_ts,
    thinking_message_ts: extras?.thinking_message_ts,
    reply_instruction: buildReplyInstruction(
      event.channel,
      reply_in_thread_ts,
      extras?.thinking_message_ts,
    ),
    is_dm:
      event.channel?.startsWith("D") || (event as any).channel_type === "im",
    has_files: !!(event as any).files?.length,
    thread_messages,
    timestamp: new Date().toISOString(),
    ...(extras?.fallback ? { fallback: true } : {}),
  });
  console.log(
    `[Triggers] Notified slack.message.received: channel=${event.channel}${thread_messages ? ` (${thread_messages.length} thread msgs)` : ""}`,
  );
}

export async function publishAppMention(
  connectionId: string,
  event: SlackEvent,
  extras?: PublishExtras,
): Promise<void> {
  const [user_name, thread_messages] = await Promise.all([
    resolveUserName(event.user),
    fetchThreadMessages(event.channel, event.thread_ts),
  ]);

  const reply_in_thread_ts = replyInThreadTs(event);

  triggers.notify(connectionId, "slack.app_mention", {
    event: "slack.app_mention",
    channel_id: event.channel,
    user_id: event.user,
    user_name,
    text: event.text ?? "",
    ts: event.ts,
    thread_ts: event.thread_ts,
    reply_in_thread_ts,
    thinking_message_ts: extras?.thinking_message_ts,
    reply_instruction: buildReplyInstruction(
      event.channel,
      reply_in_thread_ts,
      extras?.thinking_message_ts,
    ),
    has_files: !!(event as any).files?.length,
    thread_messages,
    timestamp: new Date().toISOString(),
  });
  console.log(
    `[Triggers] Notified slack.app_mention: channel=${event.channel}${thread_messages ? ` (${thread_messages.length} thread msgs)` : ""}`,
  );
}

export function publishReactionAdded(
  connectionId: string,
  event: SlackEvent,
): void {
  const channelId = (event as any).item?.channel ?? event.channel;
  triggers.notify(connectionId, "slack.reaction.added", {
    event: "slack.reaction.added",
    channel_id: channelId,
    user_id: event.user,
    reaction: (event as any).reaction,
    item_ts: (event as any).item?.ts,
    timestamp: new Date().toISOString(),
  });
  console.log(`[Triggers] Notified slack.reaction.added: channel=${channelId}`);
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
