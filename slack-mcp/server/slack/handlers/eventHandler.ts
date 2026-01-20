/**
 * Slack Event Handler
 *
 * Processes incoming Slack events and publishes to Event Bus.
 */

import { publishEvent, type EventPublishOptions } from "../../events.ts";
import {
  appendUserMessage,
  appendAssistantMessage,
  getRecentMessages,
} from "../../lib/thread.ts";
import {
  sendMessage,
  replyInThread,
  addReaction,
  getBotInfo,
} from "../../lib/slack-client.ts";
import type {
  SlackEvent,
  SlackAppMentionEvent,
  SlackMessageEvent,
} from "../../lib/types.ts";

// Event types for publishing
export const SLACK_EVENT_TYPES = {
  // Incoming events (from Slack)
  MESSAGE_RECEIVED: "slack.message.received",
  APP_MENTION: "slack.app_mention",
  REACTION_ADDED: "slack.reaction.added",
  CHANNEL_CREATED: "slack.channel.created",
  MEMBER_JOINED: "slack.member.joined",

  // Outgoing events (to Event Bus for LLM processing)
  OPERATOR_GENERATE: "operator.generate",

  // Response events (from Event Bus)
  OPERATOR_TEXT_COMPLETED: "public:operator.text.completed",
  OPERATOR_GENERATION_COMPLETED: "public:operator.generation.completed",
};

export interface SlackEventContext {
  type: string;
  payload: SlackEvent & { original_text?: string };
  teamId?: string;
  apiAppId?: string;
}

let currentEnv: EventPublishOptions | null = null;

export function setEventHandlerEnv(env: EventPublishOptions): void {
  currentEnv = env;
}

/**
 * Main event handler - routes events to appropriate handlers
 */
export async function handleSlackEvent(
  context: SlackEventContext,
): Promise<void> {
  const { type, payload } = context;

  console.log(`[EventHandler] Processing event: ${type}`, {
    channel: payload.channel,
    user: payload.user,
    ts: payload.ts,
  });

  switch (type) {
    case "app_mention":
      await handleAppMention(payload as SlackAppMentionEvent, context);
      break;

    case "message":
      await handleMessage(payload as SlackMessageEvent, context);
      break;

    case "reaction_added":
      await handleReactionAdded(payload, context);
      break;

    case "channel_created":
      await handleChannelCreated(payload, context);
      break;

    case "member_joined_channel":
      await handleMemberJoined(payload, context);
      break;

    default:
      console.log(`[EventHandler] Unhandled event type: ${type}`);
  }
}

/**
 * Handle app mention events (@bot mentions)
 */
async function handleAppMention(
  event: SlackAppMentionEvent,
  context: SlackEventContext,
): Promise<void> {
  const { channel, user, text, ts, thread_ts } = event;

  console.log(`[EventHandler] App mention from ${user} in ${channel}`);

  // Add thinking reaction to show we're processing
  await addReaction(channel, ts, "thinking_face");

  // Append user message to thread
  // Key: use ts (not thread_ts) for new mentions, thread_ts for replies
  const threadIdentifier = thread_ts ?? ts;
  await appendUserMessage(channel, ts, text, {
    slackThreadTs: thread_ts,
    userId: user,
  });

  // Get recent conversation history
  const recentMessages = await getRecentMessages(channel, threadIdentifier, 10);

  // Publish to Event Bus for LLM processing
  if (currentEnv) {
    await publishEvent(
      {
        type: SLACK_EVENT_TYPES.OPERATOR_GENERATE,
        data: {
          messages: recentMessages.map((m) => ({
            role: m.role,
            content: m.content,
          })),
          context: {
            channel,
            threadTs: threadIdentifier,
            messageTs: ts,
            userId: user,
          },
        },
        subject: `${channel}:${threadIdentifier}`,
      },
      currentEnv,
    );
  }

  // Remove thinking reaction after sending to event bus
  // The actual response will come through the event subscription
}

/**
 * Handle direct messages and channel messages
 */
async function handleMessage(
  event: SlackMessageEvent,
  context: SlackEventContext,
): Promise<void> {
  const { channel, user, text, ts, thread_ts, channel_type } = event;

  // Check if this is a DM
  const isDM = channel_type === "im" || channel?.startsWith("D");

  if (isDM) {
    console.log(`[EventHandler] DM from ${user}`);

    // For DMs, each conversation is its own thread
    await appendUserMessage(channel, ts, text, {
      userId: user,
    });

    // Get recent conversation history
    const recentMessages = await getRecentMessages(channel, ts, 10);

    // Publish to Event Bus for LLM processing
    if (currentEnv) {
      await publishEvent(
        {
          type: SLACK_EVENT_TYPES.OPERATOR_GENERATE,
          data: {
            messages: recentMessages.map((m) => ({
              role: m.role,
              content: m.content,
            })),
            context: {
              channel,
              messageTs: ts,
              userId: user,
              isDM: true,
            },
          },
          subject: `${channel}:${ts}`,
        },
        currentEnv,
      );
    }
  } else if (thread_ts) {
    // This is a reply in a thread where we're active
    console.log(`[EventHandler] Thread reply from ${user} in ${channel}`);

    await appendUserMessage(channel, ts, text, {
      slackThreadTs: thread_ts,
      userId: user,
    });

    // Get recent thread history
    const recentMessages = await getRecentMessages(channel, thread_ts, 10);

    // Publish to Event Bus
    if (currentEnv) {
      await publishEvent(
        {
          type: SLACK_EVENT_TYPES.OPERATOR_GENERATE,
          data: {
            messages: recentMessages.map((m) => ({
              role: m.role,
              content: m.content,
            })),
            context: {
              channel,
              threadTs: thread_ts,
              messageTs: ts,
              userId: user,
            },
          },
          subject: `${channel}:${thread_ts}`,
        },
        currentEnv,
      );
    }
  }
  // Regular channel messages without mention are ignored
}

/**
 * Handle reaction added events
 */
async function handleReactionAdded(
  event: SlackEvent,
  _context: SlackEventContext,
): Promise<void> {
  // Publish event for potential automation
  if (currentEnv) {
    await publishEvent(
      {
        type: SLACK_EVENT_TYPES.REACTION_ADDED,
        data: event,
        subject: event.user,
      },
      currentEnv,
    );
  }
}

/**
 * Handle channel created events
 */
async function handleChannelCreated(
  event: SlackEvent,
  _context: SlackEventContext,
): Promise<void> {
  if (currentEnv) {
    await publishEvent(
      {
        type: SLACK_EVENT_TYPES.CHANNEL_CREATED,
        data: event,
      },
      currentEnv,
    );
  }
}

/**
 * Handle member joined channel events
 */
async function handleMemberJoined(
  event: SlackEvent,
  _context: SlackEventContext,
): Promise<void> {
  if (currentEnv) {
    await publishEvent(
      {
        type: SLACK_EVENT_TYPES.MEMBER_JOINED,
        data: event,
        subject: event.user,
      },
      currentEnv,
    );
  }
}

/**
 * Handle LLM response from Event Bus
 */
export async function handleLLMResponse(
  text: string,
  context: {
    channel: string;
    threadTs?: string;
    messageTs?: string;
  },
): Promise<void> {
  const { channel, threadTs, messageTs } = context;

  // Send the response to Slack
  let responseTs: string | undefined;

  if (threadTs) {
    // Reply in the thread
    const result = await replyInThread(channel, threadTs, text);
    responseTs = result?.ts;
  } else if (messageTs) {
    // Start a new thread on the original message
    const result = await replyInThread(channel, messageTs, text);
    responseTs = result?.ts;
  } else {
    // Send to channel
    const result = await sendMessage({ channel, text });
    responseTs = result?.ts;
  }

  // Record the assistant response
  if (responseTs) {
    const threadIdentifier = threadTs ?? messageTs ?? responseTs;
    await appendAssistantMessage(channel, threadIdentifier, text, responseTs);
  }

  // Remove thinking reaction if we added one
  if (messageTs) {
    try {
      const botInfo = await getBotInfo();
      if (botInfo) {
        // Note: We can't easily remove the reaction without storing which messages got it
        // This is a simplification - in production you might want to track this
      }
    } catch {
      // Ignore reaction removal errors
    }
  }
}
