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
  addReaction,
  removeReaction,
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

// Whisper configuration
interface WhisperConfig {
  meshUrl: string;
  organizationId: string;
  token: string;
  whisperConnectionId: string;
}

let whisperConfig: WhisperConfig | null = null;

export function configureWhisper(config: WhisperConfig) {
  whisperConfig = config;
  console.log("[Whisper] Configured", {
    meshUrl: config.meshUrl,
    organizationId: config.organizationId,
    whisperConnectionId: config.whisperConnectionId,
    hasToken: !!config.token,
  });
}

/**
 * Transcribe audio using Whisper binding
 */
async function transcribeAudio(
  audioUrl: string,
  mimeType: string,
  filename: string,
): Promise<string | null> {
  if (!whisperConfig) {
    console.log("[Whisper] Not configured, skipping transcription");
    return null;
  }

  try {
    console.log(`[Whisper] Transcribing audio: ${filename} (${mimeType})`);
    console.log(`[Whisper] Audio URL: ${audioUrl.substring(0, 50)}...`);

    // Use localhost for tunnel URLs
    const isTunnel = whisperConfig.meshUrl.includes(".deco.host");
    const effectiveMeshUrl = isTunnel
      ? "http://localhost:3000"
      : whisperConfig.meshUrl;

    // Call Whisper via MCP proxy endpoint
    const url = `${effectiveMeshUrl}/mcp/${whisperConfig.whisperConnectionId}`;

    console.log(`[Whisper] Calling MCP proxy: ${url}`);

    const response = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${whisperConfig.token}`,
        Accept: "application/json, text/event-stream",
      },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: Date.now(),
        method: "tools/call",
        params: {
          name: "TRANSCRIBE_AUDIO",
          arguments: {
            audioUrl: audioUrl,
            language: undefined, // Auto-detect
            responseFormat: "text",
          },
        },
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error(
        `[Whisper] Transcription failed: ${response.status} ${response.statusText}`,
      );
      console.error(`[Whisper] Error details:`, errorText);
      return null;
    }

    const result = (await response.json()) as {
      result?: {
        content?: Array<{ type: string; text?: string }>;
        text?: string; // Direct text response format
      };
    };

    // Try to extract transcription from different response formats
    let transcription: string | undefined;

    // Format 1: MCP content array format
    if (result?.result?.content) {
      transcription = result.result.content.find(
        (c) => c.type === "text",
      )?.text;
    }

    // Format 2: Direct text field (when responseFormat: "text")
    if (!transcription && result?.result?.text) {
      const textResult = result.result.text;
      // Check if it's JSON string like {"text":"..."}
      if (typeof textResult === "string" && textResult.trim().startsWith("{")) {
        try {
          const parsed = JSON.parse(textResult);
          transcription = parsed.text || textResult;
        } catch {
          transcription = textResult;
        }
      } else {
        transcription = textResult;
      }
    }

    if (transcription) {
      console.log(
        `[Whisper] ✅ Transcription successful (${transcription.length} chars): ${transcription.substring(0, 100)}...`,
      );
      return transcription.trim();
    }

    console.warn("[Whisper] No transcription in response:", result);
    return null;
  } catch (error) {
    console.error("[Whisper] Transcription error:", error);
    return null;
  }
}

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
 * Process attached files and return media (images and audio)
 * Also returns transcriptions for audio files and warning if Whisper is needed
 */
async function processAttachedFiles(
  files: SlackAppMentionEvent["files"],
): Promise<{
  media: Array<{
    type: "image" | "audio";
    data: string;
    mimeType: string;
    name: string;
  }>;
  transcriptions: string[];
  audioWithoutWhisper: boolean;
}> {
  if (!files || files.length === 0)
    return { media: [], transcriptions: [], audioWithoutWhisper: false };

  console.log(`[EventHandler] Processing ${files.length} attached files`);

  // Log detailed file information
  files.forEach((file, index) => {
    console.log(`[EventHandler] File ${index + 1}:`, {
      name: file.name,
      mimetype: file.mimetype,
      filetype: file.filetype,
      size: file.size,
      mode: file.mode,
      url_private: file.url_private ? "present" : "missing",
      // Audio-specific fields
      duration_ms: (file as any).duration_ms,
      transcription: (file as any).transcription,
      // Log all keys to see what's available
      allKeys: Object.keys(file),
    });

    // If it's audio with transcription, log it
    if (file.mimetype.startsWith("audio/") && (file as any).transcription) {
      console.log(
        `[EventHandler] 🎤 Audio transcription:`,
        (file as any).transcription,
      );
    }
  });

  const processedFiles = await processSlackFiles(files);

  // Check if there are audio files
  const hasAudio = processedFiles.some((f) => f.type === "audio");
  const whisperConfigured = whisperConfig !== null;

  // If audio without Whisper, return only images and set warning flag
  if (hasAudio && !whisperConfigured) {
    console.warn(
      "[EventHandler] ⚠️ Audio files detected but Whisper not configured - skipping audio",
    );
    const onlyImages = processedFiles.filter((f) => f.type === "image");
    return {
      media: onlyImages,
      transcriptions: [],
      audioWithoutWhisper: true,
    };
  }

  // Transcribe audio files if Whisper is configured
  const transcriptions: string[] = [];
  if (whisperConfigured) {
    const { storeTempFile } = await import("../../lib/tempFileStore.ts");
    const { getServerBaseUrl } = await import("../../lib/serverConfig.ts");

    // Store audio files temporarily and transcribe
    for (const processedFile of processedFiles) {
      if (processedFile.type === "audio") {
        // Store file in temp store
        const tempFileId = storeTempFile(
          processedFile.data,
          processedFile.mimeType,
          processedFile.name,
        );

        // Build public URL that Whisper can access (no auth needed)
        // Uses the configured server base URL (from WEBHOOK_URL)
        const serverBaseUrl = getServerBaseUrl();
        const tempFileUrl = `${serverBaseUrl}/temp-files/${tempFileId}`;

        console.log(`[EventHandler] Audio file for transcription:`, {
          name: processedFile.name,
          mimeType: processedFile.mimeType,
          tempFileId,
          serverBaseUrl,
          tempFileUrl: tempFileUrl.substring(0, 80) + "...",
        });

        const transcription = await transcribeAudio(
          tempFileUrl,
          processedFile.mimeType,
          processedFile.name,
        );

        if (transcription) {
          console.log(
            `[EventHandler] ✅ Transcription received:`,
            transcription,
          );
          transcriptions.push(
            `[Audio: ${processedFile.name}]\n${transcription}`,
          );
        }
      }
    }
  }

  console.log(`[EventHandler] ${processedFiles.length} files ready for LLM:`, {
    images: processedFiles.filter((f) => f.type === "image").length,
    audio: processedFiles.filter((f) => f.type === "audio").length,
    transcriptions: transcriptions.length,
  });

  return { media: processedFiles, transcriptions, audioWithoutWhisper: false };
}

/**
 * Build messages for LLM with context
 */
async function buildLLMMessages(
  channel: string,
  text: string,
  ts: string,
  threadTs: string | undefined,
  media: Array<{
    type: "image" | "audio";
    data: string;
    mimeType: string;
    name: string;
  }>,
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
  const currentContent = buildCurrentContent(text, media.length, cleanMention);

  // Format messages with context/request separation
  return formatMessagesForLLM(
    contextMessages,
    currentContent,
    media.length > 0 ? media : undefined,
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

  // Add eyes reaction immediately for quick feedback
  await addReaction(channel, ts, "eyes");

  // Send thinking message immediately
  const replyTo = thread_ts ?? ts;
  const thinkingMsg = await sendThinkingMessage(channel, replyTo);

  // Remove eyes reaction when we start processing
  await removeReaction(channel, ts, "eyes");

  // Process attached files (images and audio with transcriptions)
  const { media, transcriptions, audioWithoutWhisper } =
    await processAttachedFiles(files);

  // If audio was sent without Whisper configured, inform the user
  if (audioWithoutWhisper) {
    const warningMsg =
      "🎤 Áudio detectado! Para processar arquivos de áudio, é necessário ativar a integração **Whisper** no Mesh.\n\n" +
      "Entre em contato com o administrador para configurar o Whisper e habilitar transcrição automática de áudios.";

    if (thread_ts) {
      await replyInThread(channel, thread_ts, warningMsg);
    } else {
      await replyInThread(channel, ts, warningMsg);
    }
    console.log("[EventHandler] Sent Whisper configuration warning to user");
    return;
  }

  // Add transcriptions to the message text
  const fullText =
    transcriptions.length > 0
      ? `${text}\n\n${transcriptions.join("\n\n")}`
      : text;

  // When we have transcriptions, remove audio files from media array
  // (send only transcribed text, not the audio file itself)
  // Keep images as they can be processed by the LLM
  const mediaForLLM =
    transcriptions.length > 0 ? media.filter((m) => m.type === "image") : media;

  if (transcriptions.length > 0 && mediaForLLM.length < media.length) {
    console.log(
      `[EventHandler] Filtered ${media.length - mediaForLLM.length} audio files from LLM prompt (using transcriptions instead)`,
    );
  }

  // Build messages for LLM
  const messages = await buildLLMMessages(
    channel,
    fullText,
    ts,
    thread_ts,
    mediaForLLM,
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

  // Process attached files (images and audio with transcriptions)
  const { media, transcriptions, audioWithoutWhisper } =
    await processAttachedFiles(files);

  // If audio was sent without Whisper configured, inform the user
  if (audioWithoutWhisper) {
    const warningMsg =
      "🎤 Áudio detectado! Para processar arquivos de áudio, é necessário ativar a integração **Whisper** no Mesh.\n\n" +
      "Entre em contato com o administrador para configurar o Whisper e habilitar transcrição automática de áudios.";

    if (isDM) {
      await sendMessage({ channel, text: warningMsg });
    } else if (thread_ts) {
      await replyInThread(channel, thread_ts, warningMsg);
    }
    console.log("[EventHandler] Sent Whisper configuration warning to user");
    return;
  }

  // Add transcriptions to the message text
  const fullText =
    transcriptions.length > 0
      ? `${text}\n\n${transcriptions.join("\n\n")}`
      : text;

  // When we have transcriptions, remove audio files from media array
  // (send only transcribed text, not the audio file itself)
  // Keep images as they can be processed by the LLM
  const mediaForLLM =
    transcriptions.length > 0 ? media.filter((m) => m.type === "image") : media;

  if (transcriptions.length > 0 && mediaForLLM.length < media.length) {
    console.log(
      `[EventHandler] Filtered ${media.length - mediaForLLM.length} audio files from LLM prompt (using transcriptions instead)`,
    );
  }

  const meshConfig = {
    meshUrl: teamConfig.meshUrl,
    organizationId: teamConfig.organizationId,
  };

  if (isDM) {
    await handleDirectMessage(
      channel,
      user,
      fullText,
      ts,
      mediaForLLM,
      meshConfig,
    );
  } else if (thread_ts) {
    await handleThreadReply(
      channel,
      user,
      fullText,
      ts,
      thread_ts,
      mediaForLLM,
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
  media: Array<{
    type: "image" | "audio";
    data: string;
    mimeType: string;
    name: string;
  }>,
  meshConfig: MeshConfig,
): Promise<void> {
  console.log(`[EventHandler] DM from ${user}`);

  // Add eyes reaction immediately for quick feedback
  await addReaction(channel, ts, "eyes");

  const thinkingMsg = await sendThinkingMessage(channel);

  // Remove eyes reaction when we start processing
  await removeReaction(channel, ts, "eyes");

  const messages = await buildLLMMessages(channel, text, ts, undefined, media);

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
  media: Array<{
    type: "image" | "audio";
    data: string;
    mimeType: string;
    name: string;
  }>,
  meshConfig: MeshConfig,
): Promise<void> {
  console.log(`[EventHandler] Thread reply from ${user}`);

  // Add eyes reaction immediately for quick feedback
  await addReaction(channel, ts, "eyes");

  const thinkingMsg = await sendThinkingMessage(channel, threadTs);

  // Remove eyes reaction when we start processing
  await removeReaction(channel, ts, "eyes");

  const messages = await buildLLMMessages(channel, text, ts, threadTs, media);

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
