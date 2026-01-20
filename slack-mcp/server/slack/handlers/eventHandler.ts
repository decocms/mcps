/**
 * Slack Event Handler (Multi-tenant)
 *
 * Processes incoming Slack events and publishes to Event Bus.
 * Uses team configuration for multi-tenant support.
 */

import { publishEvent } from "../../events.ts";
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
import type { SlackTeamConfig } from "../../lib/data.ts";

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

/**
 * Main event handler - routes events to appropriate handlers (Multi-tenant)
 */
export async function handleSlackEvent(
  context: SlackEventContext,
  teamConfig: SlackTeamConfig,
): Promise<void> {
  const { type, payload } = context;

  console.log(`[EventHandler] Processing event: ${type}`, {
    channel: payload.channel,
    user: payload.user,
    ts: payload.ts,
    teamId: teamConfig.teamId,
  });

  switch (type) {
    case "app_mention":
      await handleAppMention(
        payload as SlackAppMentionEvent,
        context,
        teamConfig,
      );
      break;

    case "message":
      await handleMessage(payload as SlackMessageEvent, context, teamConfig);
      break;

    case "reaction_added":
      await handleReactionAdded(payload, context, teamConfig);
      break;

    case "channel_created":
      await handleChannelCreated(payload, context, teamConfig);
      break;

    case "member_joined_channel":
      await handleMemberJoined(payload, context, teamConfig);
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
  teamConfig: SlackTeamConfig,
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
    {
      meshUrl: teamConfig.meshUrl,
      organizationId: teamConfig.organizationId,
    },
  );

  // Remove thinking reaction after sending to event bus
  // The actual response will come through the event subscription
}

/**
 * Handle direct messages and channel messages
 */
async function handleMessage(
  event: SlackMessageEvent,
  context: SlackEventContext,
  teamConfig: SlackTeamConfig,
): Promise<void> {
  const { channel, user, text, ts, thread_ts, channel_type } = event;

  // Check if this is a DM
  const isDM = channel_type === "im" || channel?.startsWith("D");

  const eventOptions = {
    meshUrl: teamConfig.meshUrl,
    organizationId: teamConfig.organizationId,
  };

  if (isDM) {
    console.log(`[EventHandler] DM from ${user}`);

    // For DMs, each conversation is its own thread
    await appendUserMessage(channel, ts, text, {
      userId: user,
    });

    // Get recent conversation history
    const recentMessages = await getRecentMessages(channel, ts, 10);

    // Publish to Event Bus for LLM processing
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
      eventOptions,
    );
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
      eventOptions,
    );
  }
  // Regular channel messages without mention are ignored
}

/**
 * Handle reaction added events
 */
async function handleReactionAdded(
  event: SlackEvent,
  _context: SlackEventContext,
  teamConfig: SlackTeamConfig,
): Promise<void> {
  // Publish event for potential automation
  await publishEvent(
    {
      type: SLACK_EVENT_TYPES.REACTION_ADDED,
      data: event,
      subject: event.user,
    },
    {
      meshUrl: teamConfig.meshUrl,
      organizationId: teamConfig.organizationId,
    },
  );
}

/**
 * Handle channel created events
 */
async function handleChannelCreated(
  event: SlackEvent,
  _context: SlackEventContext,
  teamConfig: SlackTeamConfig,
): Promise<void> {
  await publishEvent(
    {
      type: SLACK_EVENT_TYPES.CHANNEL_CREATED,
      data: event,
    },
    {
      meshUrl: teamConfig.meshUrl,
      organizationId: teamConfig.organizationId,
    },
  );
}

/**
 * Handle member joined channel events
 */
async function handleMemberJoined(
  event: SlackEvent,
  _context: SlackEventContext,
  teamConfig: SlackTeamConfig,
): Promise<void> {
  await publishEvent(
    {
      type: SLACK_EVENT_TYPES.MEMBER_JOINED,
      data: event,
      subject: event.user,
    },
    {
      meshUrl: teamConfig.meshUrl,
      organizationId: teamConfig.organizationId,
    },
  );
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

/**
 * Handle Slack webhook events received via Mesh Event Bus
 * This is the new multi-tenant entry point for webhooks
 */
export async function handleSlackWebhookEvent(
  payload: unknown,
  config: {
    organizationId: string;
    meshUrl: string;
  },
): Promise<void> {
  console.log("[EventHandler] Processing webhook from Mesh Event Bus");
  console.log("[EventHandler] Payload:", JSON.stringify(payload, null, 2));

  // The payload should be the Slack webhook payload
  const slackPayload = payload as {
    type?: string;
    challenge?: string;
    event?: SlackEvent;
    team_id?: string;
  };

  // Handle URL verification challenge
  if (slackPayload.type === "url_verification" && slackPayload.challenge) {
    console.log("[EventHandler] URL verification challenge received");
    // For challenges via Event Bus, we just log - the response goes back via Mesh
    return;
  }

  // Handle event callbacks
  if (slackPayload.type === "event_callback" && slackPayload.event) {
    const event = slackPayload.event;
    const eventType = event.type;

    console.log(`[EventHandler] Processing event: ${eventType}`);

    // Create a minimal team config for event handling
    const teamConfig: SlackTeamConfig = {
      teamId: slackPayload.team_id ?? "unknown",
      organizationId: config.organizationId,
      meshUrl: config.meshUrl,
      botToken: "", // Not needed for event handling via Event Bus
      signingSecret: "", // Not needed - Mesh handles auth
    };

    // Route to appropriate handler
    switch (eventType) {
      case "app_mention":
        await handleAppMention(
          event as SlackAppMentionEvent,
          { type: eventType, payload: event },
          teamConfig,
        );
        break;

      case "message":
        await handleMessage(
          event as SlackMessageEvent,
          { type: eventType, payload: event },
          teamConfig,
        );
        break;

      case "reaction_added":
        await handleReactionAdded(
          event,
          { type: eventType, payload: event },
          teamConfig,
        );
        break;

      case "channel_created":
        await handleChannelCreated(
          event,
          { type: eventType, payload: event },
          teamConfig,
        );
        break;

      case "member_joined_channel":
        await handleMemberJoined(
          event,
          { type: eventType, payload: event },
          teamConfig,
        );
        break;

      default:
        console.log(`[EventHandler] Unhandled event type: ${eventType}`);
    }
  }
}
