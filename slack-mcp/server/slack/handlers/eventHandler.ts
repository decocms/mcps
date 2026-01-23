/**
 * Slack Event Handler
 *
 * Main event router for Slack events.
 * Uses modular handlers for context building and LLM calls.
 */

import { publishEvent } from "../../events.ts";
import { appendAssistantMessage } from "../../lib/thread.ts";
import {
  sendMessage,
  replyInThread,
  getBotInfo,
  getThreadReplies,
  sendThinkingMessage,
  processSlackFiles,
} from "../../lib/slack-client.ts";
import type {
  SlackEvent,
  SlackAppMentionEvent,
  SlackMessageEvent,
} from "../../lib/types.ts";
import { readTeamConfig, type SlackTeamConfig } from "../../lib/data.ts";
import {
  logger,
  pauseSlackLogging,
  resumeSlackLogging,
} from "../../lib/logger.ts";
import { shouldIgnoreEvent } from "../../webhook.ts";

// Import modular handlers
import {
  configureContext as setContextConfig,
  setBotUserId as setContextBotUserId,
  buildContextMessages,
  formatMessagesForLLM,
  buildCurrentContent,
  isContextEnabled,
  type ContextConfig,
} from "./context-builder.ts";
import {
  configureLLM as setLLMConfig,
  clearLLMConfig as clearLLMConfigInternal,
  configureStreaming as setStreamingConfig,
  isLLMConfigured,
  handleLLMCall,
} from "./llm-handler.ts";
import {
  SLACK_EVENT_TYPES,
  type SlackEventContext,
  type SlackWebhookPayload,
  type MeshConfig,
} from "./types.ts";

// Re-export for external use
export { SLACK_EVENT_TYPES };
export type { SlackEventContext, ContextConfig };
export { type LLMConfig } from "../../lib/llm.ts";

// Global bot user ID for thread participation check
let globalBotUserId: string | null = null;

/**
 * Configure LLM settings
 */
export function configureLLM(config: Parameters<typeof setLLMConfig>[0]): void {
  setLLMConfig(config);
}

/**
 * Clear LLM configuration (prevents cross-tenant config leakage)
 */
export function clearLLMConfig(): void {
  clearLLMConfigInternal();
}

/**
 * Configure context building settings
 */
export function configureContext(config: ContextConfig): void {
  setContextConfig(config);
}

/**
 * Configure streaming behavior
 */
export function configureStreaming(enabled: boolean): void {
  setStreamingConfig(enabled);
}

/**
 * Set the bot user ID for filtering and participation checks
 */
export function setBotUserId(botUserId: string): void {
  globalBotUserId = botUserId;
  setContextBotUserId(botUserId);
  console.log("[EventHandler] Bot user ID set:", botUserId);
}

/**
 * Check if bot participated in a thread
 */
async function botParticipatedInThread(
  channel: string,
  threadTs: string,
  botUserId: string | null,
): Promise<boolean> {
  if (!botUserId) return false;
  const replies = await getThreadReplies(channel, threadTs, 50);
  return replies.some((msg) => msg.user === botUserId);
}

/**
 * Process attached files and return images
 */
async function processAttachedImages(
  files: SlackAppMentionEvent["files"],
): Promise<Array<{ type: "image"; data: string; mimeType: string }>> {
  if (!files || files.length === 0) return [];

  console.log(`[EventHandler] Processing ${files.length} attached files`);
  const processedFiles = await processSlackFiles(files);
  const images = processedFiles.map((f) => ({
    type: "image" as const,
    data: f.data,
    mimeType: f.mimeType,
  }));
  console.log(`[EventHandler] ${images.length} images ready for LLM`);
  return images;
}

/**
 * Build messages for LLM with context
 */
async function buildLLMMessages(
  channel: string,
  text: string,
  ts: string,
  threadTs: string | undefined,
  images: Array<{ type: "image"; data: string; mimeType: string }>,
  cleanMention: boolean = false,
) {
  // Build context from previous messages (if configured)
  let contextMessages: Array<{ role: "user" | "assistant"; content: string }> =
    [];

  if (isContextEnabled()) {
    contextMessages = await buildContextMessages(channel, threadTs, ts);
    console.log(
      `[EventHandler] Context: ${contextMessages.length} previous messages`,
    );
  } else {
    console.log("[EventHandler] Context disabled");
  }

  // Build current content
  const currentContent = buildCurrentContent(text, images.length, cleanMention);

  // Format messages with context/request separation
  return formatMessagesForLLM(
    contextMessages,
    currentContent,
    images.length > 0 ? images : undefined,
  );
}

/**
 * Publish event to Event Bus (fallback when LLM not configured)
 */
async function publishToEventBus(
  eventType: string,
  messages: unknown[],
  context: {
    channel: string;
    threadTs?: string;
    messageTs: string;
    userId?: string;
    isDM?: boolean;
  },
  meshConfig: MeshConfig,
): Promise<void> {
  console.log("[EventHandler] LLM not configured, publishing to Event Bus");
  await publishEvent(
    {
      type: eventType,
      data: { messages, context },
      subject: `${context.channel}:${context.threadTs ?? context.messageTs}`,
    },
    meshConfig,
  );
}

// ============================================================================
// Event Handlers
// ============================================================================

/**
 * Main event router
 */
export async function handleSlackEvent(
  context: SlackEventContext,
  teamConfig: SlackTeamConfig,
): Promise<void> {
  const { type, payload } = context;

  console.log(`[EventHandler] Processing: ${type}`, {
    channel: payload.channel,
    user: payload.user,
    ts: payload.ts,
    teamId: teamConfig.teamId,
  });

  switch (type) {
    case "app_mention":
      await handleAppMention(payload as SlackAppMentionEvent, teamConfig);
      break;
    case "message":
      await handleMessage(payload as SlackMessageEvent, teamConfig);
      break;
    case "reaction_added":
      await handleReactionAdded(payload, teamConfig);
      break;
    case "channel_created":
      await handleChannelCreated(payload, teamConfig);
      break;
    case "member_joined_channel":
      await handleMemberJoined(payload, teamConfig);
      break;
    default:
      console.log(`[EventHandler] Unhandled event type: ${type}`);
  }
}

/**
 * Handle @bot mentions
 */
async function handleAppMention(
  event: SlackAppMentionEvent,
  teamConfig: SlackTeamConfig,
): Promise<void> {
  const { channel, user, text, ts, thread_ts, files } = event;
  console.log(`[EventHandler] App mention from ${user} in ${channel}`);

  // Send thinking message immediately
  const replyTo = thread_ts ?? ts;
  const thinkingMsg = await sendThinkingMessage(channel, replyTo);

  // Process images
  const images = await processAttachedImages(files);

  // Build messages for LLM
  const messages = await buildLLMMessages(
    channel,
    text,
    ts,
    thread_ts,
    images,
    true, // Clean bot mention
  );

  const meshConfig = {
    meshUrl: teamConfig.meshUrl,
    organizationId: teamConfig.organizationId,
  };

  // Check if LLM is configured
  if (!isLLMConfigured()) {
    await publishToEventBus(
      SLACK_EVENT_TYPES.OPERATOR_GENERATE,
      messages,
      { channel, threadTs: replyTo, messageTs: ts, userId: user },
      meshConfig,
    );
    return;
  }

  // Call LLM
  try {
    await handleLLMCall(messages, {
      channel,
      replyTo,
      thinkingMessageTs: thinkingMsg?.ts,
    });
    console.log("[EventHandler] LLM response sent");
  } catch (error) {
    console.error("[EventHandler] LLM error:", error);
  }
}

/**
 * Handle direct messages and channel messages
 */
async function handleMessage(
  event: SlackMessageEvent,
  teamConfig: SlackTeamConfig,
): Promise<void> {
  const { channel, user, text, ts, thread_ts, channel_type, files } = event;
  const isDM = channel_type === "im" || channel?.startsWith("D");
  const botUserId = globalBotUserId ?? teamConfig.botUserId;

  // Skip messages with bot mention in channels (handled by app_mention)
  if (!isDM && botUserId && text?.includes(`<@${botUserId}>`)) {
    console.log("[EventHandler] Skipping - will be handled by app_mention");
    return;
  }

  // For threads, check if bot participated
  if (thread_ts && !isDM) {
    const botParticipated = await botParticipatedInThread(
      channel,
      thread_ts,
      botUserId ?? null,
    );
    if (!botParticipated) {
      console.log(`[EventHandler] Ignoring thread reply - bot not in thread`);
      return;
    }
  }

  // Process images
  const images = await processAttachedImages(files);

  const meshConfig = {
    meshUrl: teamConfig.meshUrl,
    organizationId: teamConfig.organizationId,
  };

  if (isDM) {
    await handleDirectMessage(channel, user, text, ts, images, meshConfig);
  } else if (thread_ts) {
    await handleThreadReply(
      channel,
      user,
      text,
      ts,
      thread_ts,
      images,
      meshConfig,
    );
  }
  // Regular channel messages without mention are ignored
}

/**
 * Handle direct messages
 */
async function handleDirectMessage(
  channel: string,
  user: string,
  text: string,
  ts: string,
  images: Array<{ type: "image"; data: string; mimeType: string }>,
  meshConfig: MeshConfig,
): Promise<void> {
  console.log(`[EventHandler] DM from ${user}`);

  const thinkingMsg = await sendThinkingMessage(channel);
  const messages = await buildLLMMessages(channel, text, ts, undefined, images);

  if (!isLLMConfigured()) {
    await publishToEventBus(
      SLACK_EVENT_TYPES.OPERATOR_GENERATE,
      messages,
      { channel, messageTs: ts, userId: user, isDM: true },
      meshConfig,
    );
    return;
  }

  try {
    await handleLLMCall(messages, {
      channel,
      thinkingMessageTs: thinkingMsg?.ts,
    });
    console.log("[EventHandler] DM response sent");
  } catch (error) {
    console.error("[EventHandler] DM error:", error);
  }
}

/**
 * Handle thread replies
 */
async function handleThreadReply(
  channel: string,
  user: string,
  text: string,
  ts: string,
  threadTs: string,
  images: Array<{ type: "image"; data: string; mimeType: string }>,
  meshConfig: MeshConfig,
): Promise<void> {
  console.log(`[EventHandler] Thread reply from ${user}`);

  const thinkingMsg = await sendThinkingMessage(channel, threadTs);
  const messages = await buildLLMMessages(channel, text, ts, threadTs, images);

  if (!isLLMConfigured()) {
    await publishToEventBus(
      SLACK_EVENT_TYPES.OPERATOR_GENERATE,
      messages,
      { channel, threadTs, messageTs: ts, userId: user },
      meshConfig,
    );
    return;
  }

  try {
    await handleLLMCall(messages, {
      channel,
      replyTo: threadTs,
      thinkingMessageTs: thinkingMsg?.ts,
    });
    console.log("[EventHandler] Thread response sent");
  } catch (error) {
    console.error("[EventHandler] Thread error:", error);
  }
}

/**
 * Handle reaction added events
 */
async function handleReactionAdded(
  event: SlackEvent,
  teamConfig: SlackTeamConfig,
): Promise<void> {
  await publishEvent(
    {
      type: SLACK_EVENT_TYPES.REACTION_ADDED,
      data: event,
      subject: event.user,
    },
    { meshUrl: teamConfig.meshUrl, organizationId: teamConfig.organizationId },
  );
}

/**
 * Handle channel created events
 */
async function handleChannelCreated(
  event: SlackEvent,
  teamConfig: SlackTeamConfig,
): Promise<void> {
  await publishEvent(
    { type: SLACK_EVENT_TYPES.CHANNEL_CREATED, data: event },
    { meshUrl: teamConfig.meshUrl, organizationId: teamConfig.organizationId },
  );
}

/**
 * Handle member joined channel events
 */
async function handleMemberJoined(
  event: SlackEvent,
  teamConfig: SlackTeamConfig,
): Promise<void> {
  await publishEvent(
    {
      type: SLACK_EVENT_TYPES.MEMBER_JOINED,
      data: event,
      subject: event.user,
    },
    { meshUrl: teamConfig.meshUrl, organizationId: teamConfig.organizationId },
  );
}

// ============================================================================
// Event Bus Response Handlers
// ============================================================================

/**
 * Handle LLM response from Event Bus
 */
export async function handleLLMResponse(
  text: string,
  context: { channel: string; threadTs?: string; messageTs?: string },
): Promise<void> {
  const { channel, threadTs, messageTs } = context;

  await logger.info("LLM Response Received", {
    channel,
    threadTs,
    messageTs,
    responseLength: text.length,
  });

  let responseTs: string | undefined;

  try {
    if (threadTs) {
      const result = await replyInThread(channel, threadTs, text);
      responseTs = result?.ts;
    } else if (messageTs) {
      const result = await replyInThread(channel, messageTs, text);
      responseTs = result?.ts;
    } else {
      const result = await sendMessage({ channel, text });
      responseTs = result?.ts;
    }

    if (responseTs) {
      await logger.messageSent(channel, text);
      const threadIdentifier = threadTs ?? messageTs ?? responseTs;
      await appendAssistantMessage(channel, threadIdentifier, text, responseTs);
    }
  } catch (error) {
    await logger.error("Failed to send message", { error: String(error) });
    throw error;
  }

  // Try to get bot info for cleanup
  if (messageTs) {
    try {
      await getBotInfo();
    } catch {
      // Ignore reaction removal errors
    }
  }
}

// ============================================================================
// Webhook Handler (Multi-tenant entry point)
// ============================================================================

/**
 * Handle Slack webhook events from Mesh Event Bus
 */
export async function handleSlackWebhookEvent(
  payload: unknown,
  config: MeshConfig,
): Promise<void> {
  pauseSlackLogging();

  try {
    console.log("[EventHandler] ========================================");
    console.log("[EventHandler] Processing webhook from Mesh");

    await logger.webhookProcessing("Webhook received", { ...config });

    // Validate payload
    if (!payload || typeof payload !== "object") {
      throw new Error("Invalid webhook payload - expected object");
    }

    const slackPayload = payload as SlackWebhookPayload;

    await logger.webhookProcessing("Payload parsed", {
      type: slackPayload.type,
      teamId: slackPayload.team_id,
      hasEvent: !!slackPayload.event,
    });

    // Handle URL verification
    if (slackPayload.type === "url_verification") {
      await logger.success("URL Verification Challenge handled");
      return;
    }

    if (!slackPayload.type) {
      throw new Error("Invalid webhook payload - missing type");
    }

    // Handle event callbacks
    if (slackPayload.type === "event_callback") {
      await handleEventCallback(slackPayload, config);
      return;
    }

    await logger.webhookError(`Unknown payload type: ${slackPayload.type}`);
  } finally {
    resumeSlackLogging();
  }
}

/**
 * Handle event_callback payload type
 */
async function handleEventCallback(
  slackPayload: SlackWebhookPayload,
  config: MeshConfig,
): Promise<void> {
  await logger.webhookProcessing("Event callback received");

  if (!slackPayload.event) {
    throw new Error("Invalid event_callback - missing event");
  }

  const event = slackPayload.event;
  const eventType = event.type;
  const teamId = slackPayload.team_id ?? "unknown";

  // Get team config for bot filtering
  const savedTeamConfig = await readTeamConfig(teamId);
  const botUserId = savedTeamConfig?.botUserId;

  // Check if we should ignore this event
  if (
    shouldIgnoreEvent(
      slackPayload as Parameters<typeof shouldIgnoreEvent>[0],
      botUserId,
    )
  ) {
    console.log("[EventHandler] Ignoring bot/ignored event");
    return;
  }

  await logger.eventReceived(eventType, {
    user: event.user,
    channel: event.channel,
    text: event.text?.substring(0, 100),
  });

  // Create team config
  const teamConfig: SlackTeamConfig = savedTeamConfig ?? {
    teamId,
    organizationId: config.organizationId,
    meshUrl: config.meshUrl,
    botToken: "",
    signingSecret: "",
    configuredAt: new Date().toISOString(),
  };

  // Route to handler
  try {
    await routeEventToHandler(event, eventType, teamConfig);
  } catch (error) {
    await logger.eventError(eventType, String(error));
    throw error;
  }
}

/**
 * Route event to appropriate handler
 */
async function routeEventToHandler(
  event: SlackEvent,
  eventType: string,
  teamConfig: SlackTeamConfig,
): Promise<void> {
  const context: SlackEventContext = { type: eventType, payload: event };

  switch (eventType) {
    case "app_mention":
      await logger.webhookProcessing(`Handling ${eventType}`);
      await handleAppMention(event as SlackAppMentionEvent, teamConfig);
      await logger.eventHandled(eventType);
      break;

    case "message":
      await logger.webhookProcessing(`Handling ${eventType}`);
      await handleMessage(event as SlackMessageEvent, teamConfig);
      await logger.eventHandled(eventType);
      break;

    case "reaction_added":
      await logger.webhookProcessing(`Handling ${eventType}`);
      await handleReactionAdded(event, teamConfig);
      await logger.eventHandled(eventType);
      break;

    case "channel_created":
      await logger.webhookProcessing(`Handling ${eventType}`);
      await handleChannelCreated(event, teamConfig);
      await logger.eventHandled(eventType);
      break;

    case "member_joined_channel":
      await logger.webhookProcessing(`Handling ${eventType}`);
      await handleMemberJoined(event, teamConfig);
      await logger.eventHandled(eventType);
      break;

    default:
      await logger.warn(`Unhandled event type: ${eventType}`);
  }
}
