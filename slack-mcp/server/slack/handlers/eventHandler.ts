/**
 * Slack Event Handler
 *
 * Main event router for Slack events.
 * Uses modular handlers for context building and LLM calls.
 */

import {
  publishMessageReceived,
  publishAppMention,
  publishReactionAdded,
  publishChannelCreated,
  publishMemberJoined,
} from "../../lib/event-publisher.ts";
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
  deleteMessage,
  getUserInfo,
} from "../../lib/slack-client.ts";
import type {
  SlackEvent,
  SlackAppMentionEvent,
  SlackMessageEvent,
} from "../../lib/types.ts";
import { logger } from "../../lib/logger.ts";
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
import { isLLMAvailable, handleLLMCall } from "./llm-handler.ts";

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

    const isLocalTunnel =
      whisperConfig.meshUrl.includes("localhost") &&
      whisperConfig.meshUrl.includes(".deco.host");
    const effectiveMeshUrl = isLocalTunnel
      ? "http://localhost:3000"
      : whisperConfig.meshUrl;

    const url = `${effectiveMeshUrl}/mcp/${whisperConfig.whisperConnectionId}`;

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
            language: undefined,
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
        text?: string;
      };
    };

    let transcription: string | undefined;

    if (result?.result?.content) {
      transcription = result.result.content.find(
        (c) => c.type === "text",
      )?.text;
    }

    if (!transcription && result?.result?.text) {
      const textResult = result.result.text;
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
        `[Whisper] Transcription successful (${transcription.length} chars)`,
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
} from "./types.ts";

// Re-export for external use
export { SLACK_EVENT_TYPES };
export type { SlackEventContext, ContextConfig };

// SlackTeamConfig type for compatibility
type SlackTeamConfig = {
  teamId: string;
  organizationId: string;
  meshUrl: string;
  botToken: string;
  signingSecret: string;
  botUserId?: string;
  configuredAt?: string;
  responseConfig?: {
    triggerOnly?: boolean;
    showOnlyFinalResponse?: boolean;
    enableStreaming?: boolean;
    showThinkingMessage?: boolean;
  };
};

// Global bot user ID for thread participation check
let globalBotUserId: string | null = null;

/**
 * Configure context building settings
 */
export function configureContext(config: ContextConfig): void {
  setContextConfig(config);
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
  textFiles: Array<{ name: string; content: string; mimeType: string }>;
  transcriptions: string[];
  audioWithoutWhisper: boolean;
}> {
  if (!files || files.length === 0)
    return {
      media: [],
      textFiles: [],
      transcriptions: [],
      audioWithoutWhisper: false,
    };

  console.log(`[EventHandler] Processing ${files.length} attached files`);

  const processedFiles = await processSlackFiles(files);

  const textFiles: Array<{ name: string; content: string; mimeType: string }> =
    [];
  const mediaFiles: Array<{
    type: "image" | "audio";
    data: string;
    mimeType: string;
    name: string;
  }> = [];

  for (const file of processedFiles) {
    if (file.type === "text") {
      textFiles.push({
        name: file.name,
        content: file.data,
        mimeType: file.mimeType,
      });
    } else {
      mediaFiles.push(
        file as {
          type: "image" | "audio";
          data: string;
          mimeType: string;
          name: string;
        },
      );
    }
  }

  const hasAudio = mediaFiles.some((f) => f.type === "audio");
  const whisperConfigured = whisperConfig !== null;

  if (hasAudio && !whisperConfigured) {
    console.warn(
      "[EventHandler] Audio files detected but Whisper not configured - skipping audio",
    );
    const onlyImages = mediaFiles.filter((f) => f.type === "image");
    return {
      media: onlyImages,
      textFiles,
      transcriptions: [],
      audioWithoutWhisper: true,
    };
  }

  const transcriptions: string[] = [];
  if (whisperConfigured) {
    const { storeTempFile } = await import("../../lib/tempFileStore.ts");
    const { getServerBaseUrl } = await import("../../lib/serverConfig.ts");

    for (const processedFile of mediaFiles) {
      if (processedFile.type === "audio") {
        const tempFileId = storeTempFile(
          processedFile.data,
          processedFile.mimeType,
          processedFile.name,
        );

        const serverBaseUrl = getServerBaseUrl();
        const tempFileUrl = `${serverBaseUrl}/temp-files/${tempFileId}`;

        const transcription = await transcribeAudio(
          tempFileUrl,
          processedFile.mimeType,
          processedFile.name,
        );

        if (transcription) {
          transcriptions.push(
            `[Audio: ${processedFile.name}]\n${transcription}`,
          );
        }
      }
    }
  }

  return {
    media: mediaFiles,
    textFiles,
    transcriptions,
    audioWithoutWhisper: false,
  };
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
  let contextMessages: Array<{ role: "user" | "assistant"; content: string }> =
    [];

  if (isContextEnabled()) {
    contextMessages = await buildContextMessages(channel, threadTs, ts);
  }

  const currentContent = buildCurrentContent(text, media.length, cleanMention);

  return formatMessagesForLLM(
    contextMessages,
    currentContent,
    media.length > 0 ? media : undefined,
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
  connectionId: string,
): Promise<void> {
  const { type, payload } = context;

  const triggerOnly = teamConfig.responseConfig?.triggerOnly ?? false;

  switch (type) {
    case "app_mention":
      publishAppMention(connectionId, payload);
      if (!triggerOnly) {
        await handleAppMention(
          payload as SlackAppMentionEvent,
          teamConfig,
          connectionId,
        );
      }
      break;
    case "message":
      publishMessageReceived(connectionId, payload);
      if (!triggerOnly) {
        await handleMessage(
          payload as SlackMessageEvent,
          teamConfig,
          connectionId,
        );
      }
      break;
    case "reaction_added":
      publishReactionAdded(connectionId, payload);
      break;
    case "channel_created":
      publishChannelCreated(connectionId, payload);
      break;
    case "member_joined_channel":
      publishMemberJoined(connectionId, payload);
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
  connectionId: string,
): Promise<void> {
  const { channel, user, text, ts, thread_ts, files } = event;

  const showOnlyFinal =
    teamConfig.responseConfig?.showOnlyFinalResponse ?? false;

  if (!showOnlyFinal) {
    await addReaction(channel, ts, "eyes");
  }

  const replyTo = thread_ts ?? ts;
  const showThinking = showOnlyFinal
    ? false
    : (teamConfig.responseConfig?.showThinkingMessage ?? true);
  const thinkingMsg = showThinking
    ? await sendThinkingMessage(channel, replyTo)
    : null;

  if (!showOnlyFinal) {
    await removeReaction(channel, ts, "eyes");
  }

  const { media, textFiles, transcriptions, audioWithoutWhisper } =
    await processAttachedFiles(files);

  if (audioWithoutWhisper) {
    const warningMsg =
      "Audio detectado! Para processar arquivos de audio, e necessario ativar a integracao **Whisper** no Mesh.";
    await replyInThread(channel, replyTo, warningMsg);
    return;
  }

  const { getLanguageFromFilename } = await import("../../lib/slack-client.ts");
  const textFileContent = textFiles
    .map((file) => {
      const language = getLanguageFromFilename(file.name);
      return `[File: ${file.name}]\n\`\`\`${language}\n${file.content}\n\`\`\``;
    })
    .join("\n\n");

  let fullText = text;
  if (transcriptions.length > 0) {
    fullText += `\n\n${transcriptions.join("\n\n")}`;
  }
  if (textFileContent) {
    fullText += `\n\n${textFileContent}`;
  }

  const mediaForLLM =
    transcriptions.length > 0 ? media.filter((m) => m.type === "image") : media;

  const messages = await buildLLMMessages(
    channel,
    fullText,
    ts,
    thread_ts,
    mediaForLLM,
    true,
  );

  if (!(await isLLMAvailable(connectionId))) {
    const warningMsg =
      "Bot ainda inicializando. Por favor, tente novamente em alguns segundos.";
    await replyInThread(channel, replyTo, warningMsg);
    return;
  }

  const enableStreaming = showOnlyFinal
    ? false
    : (teamConfig.responseConfig?.enableStreaming ?? true);

  try {
    await handleLLMCall(connectionId, messages, {
      channel,
      replyTo,
      thinkingMessageTs: thinkingMsg?.ts,
      streamingEnabled: enableStreaming,
      slackEvent: { text: fullText, user, ts, thread_ts },
    });
  } catch (error) {
    logger.error("App mention LLM error", {
      channel,
      userId: user,
      error: String(error),
    });
  }
}

/**
 * Handle direct messages and channel messages
 */
async function handleMessage(
  event: SlackMessageEvent,
  teamConfig: SlackTeamConfig,
  connectionId: string,
): Promise<void> {
  const { channel, user, text, ts, thread_ts, channel_type, files } = event;
  const isDM = channel_type === "im" || channel?.startsWith("D");
  const botUserId = globalBotUserId ?? teamConfig.botUserId;

  // Skip messages with bot mention in channels (handled by app_mention)
  if (!isDM && botUserId && text?.includes(`<@${botUserId}>`)) {
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
      return;
    }
  }

  const { media, textFiles, transcriptions, audioWithoutWhisper } =
    await processAttachedFiles(files);

  if (audioWithoutWhisper) {
    const warningMsg =
      "Audio detectado! Para processar arquivos de audio, e necessario ativar a integracao **Whisper** no Mesh.";
    if (isDM) {
      await sendMessage({ channel, text: warningMsg });
    } else if (thread_ts) {
      await replyInThread(channel, thread_ts, warningMsg);
    }
    return;
  }

  const { getLanguageFromFilename } = await import("../../lib/slack-client.ts");
  const textFileContent = textFiles
    .map((file) => {
      const language = getLanguageFromFilename(file.name);
      return `[File: ${file.name}]\n\`\`\`${language}\n${file.content}\n\`\`\``;
    })
    .join("\n\n");

  let fullText = text;
  if (transcriptions.length > 0) {
    fullText += `\n\n${transcriptions.join("\n\n")}`;
  }
  if (textFileContent) {
    fullText += `\n\n${textFileContent}`;
  }

  const mediaForLLM =
    transcriptions.length > 0 ? media.filter((m) => m.type === "image") : media;

  if (isDM) {
    await handleDirectMessage(
      channel,
      user,
      fullText,
      ts,
      mediaForLLM,
      teamConfig,
      connectionId,
    );
  } else if (thread_ts) {
    await handleThreadReply(
      channel,
      user,
      fullText,
      ts,
      thread_ts,
      mediaForLLM,
      teamConfig,
      connectionId,
    );
  }
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
  teamConfig: SlackTeamConfig,
  connectionId: string,
): Promise<void> {
  const showOnlyFinal =
    teamConfig.responseConfig?.showOnlyFinalResponse ?? false;

  if (!showOnlyFinal) {
    await addReaction(channel, ts, "eyes");
  }

  const showThinking = showOnlyFinal
    ? false
    : (teamConfig.responseConfig?.showThinkingMessage ?? true);
  const thinkingMsg = showThinking ? await sendThinkingMessage(channel) : null;

  if (!showOnlyFinal) {
    await removeReaction(channel, ts, "eyes");
  }

  // Resolve sender name
  let senderText = text;
  try {
    const userInfo = await getUserInfo(user);
    const senderName = userInfo
      ? userInfo.profile?.display_name || userInfo.real_name || userInfo.name
      : null;
    if (senderName) {
      senderText = `[Mensagem de ${senderName}]\n${text}`;
    }
  } catch (err) {
    console.warn(`[EventHandler] Failed to resolve DM sender name:`, err);
  }

  const messages = await buildLLMMessages(
    channel,
    senderText,
    ts,
    undefined,
    media,
  );

  if (!(await isLLMAvailable(connectionId))) {
    const warningMsg =
      "Bot ainda inicializando. Por favor, tente novamente em alguns segundos.";
    await sendMessage({ channel, text: warningMsg });
    if (thinkingMsg?.ts) {
      await deleteMessage(channel, thinkingMsg.ts);
    }
    return;
  }

  const enableStreaming = showOnlyFinal
    ? false
    : (teamConfig.responseConfig?.enableStreaming ?? true);

  try {
    await handleLLMCall(connectionId, messages, {
      channel,
      thinkingMessageTs: thinkingMsg?.ts,
      streamingEnabled: enableStreaming,
      slackEvent: { text, user, ts, channel_type: "im" },
    });
  } catch (error) {
    logger.error("Direct message LLM error", {
      channel,
      userId: user,
      error: String(error),
      errorStack: error instanceof Error ? error.stack : undefined,
      errorMessage: error instanceof Error ? error.message : String(error),
      messagesCount: messages.length,
    });
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
  teamConfig: SlackTeamConfig,
  connectionId: string,
): Promise<void> {
  const showOnlyFinal =
    teamConfig.responseConfig?.showOnlyFinalResponse ?? false;

  if (!showOnlyFinal) {
    await addReaction(channel, ts, "eyes");
  }

  const showThinking = showOnlyFinal
    ? false
    : (teamConfig.responseConfig?.showThinkingMessage ?? true);
  const thinkingMsg = showThinking
    ? await sendThinkingMessage(channel, threadTs)
    : null;

  if (!showOnlyFinal) {
    await removeReaction(channel, ts, "eyes");
  }

  const messages = await buildLLMMessages(channel, text, ts, threadTs, media);

  if (!(await isLLMAvailable(connectionId))) {
    const warningMsg =
      "Bot ainda inicializando. Por favor, tente novamente em alguns segundos.";
    await replyInThread(channel, threadTs, warningMsg);
    if (thinkingMsg?.ts) {
      await deleteMessage(channel, thinkingMsg.ts);
    }
    return;
  }

  const enableStreaming = showOnlyFinal
    ? false
    : (teamConfig.responseConfig?.enableStreaming ?? true);

  try {
    await handleLLMCall(connectionId, messages, {
      channel,
      replyTo: threadTs,
      thinkingMessageTs: thinkingMsg?.ts,
      streamingEnabled: enableStreaming,
      slackEvent: { text, user, ts, thread_ts: threadTs },
    });
  } catch (error) {
    logger.error("Thread reply LLM error", {
      channel,
      userId: user,
      threadTs,
      error: String(error),
    });
  }
}

// ============================================================================
// Event Bus Response Handlers (kept for backwards compatibility)
// ============================================================================

/**
 * Handle LLM response from Event Bus
 */
export async function handleLLMResponse(
  text: string,
  context: { channel: string; threadTs?: string; messageTs?: string },
): Promise<void> {
  const { channel, threadTs, messageTs } = context;

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
      const threadIdentifier = threadTs ?? messageTs ?? responseTs;
      await appendAssistantMessage(channel, threadIdentifier, text, responseTs);
    }
  } catch (error) {
    const errorMessage = String(error);

    if (
      errorMessage.includes("channel_not_found") ||
      errorMessage.includes("not_in_channel")
    ) {
      console.warn(
        `[Event Handler] Cannot send message - channel ${channel} issue: ${errorMessage}`,
      );
      return;
    }

    await logger.error("Failed to send message", { error: errorMessage });
    throw error;
  }
}

/**
 * Handle Slack webhook events from Mesh Event Bus
 */
export async function handleSlackWebhookEvent(
  payload: unknown,
  config: { organizationId: string; meshUrl: string },
): Promise<void> {
  try {
    if (!payload || typeof payload !== "object") {
      throw new Error("Invalid webhook payload - expected object");
    }

    const slackPayload = payload as SlackWebhookPayload;

    if (slackPayload.type === "url_verification") {
      return;
    }

    if (!slackPayload.type) {
      throw new Error("Invalid webhook payload - missing type");
    }

    if (slackPayload.type === "event_callback") {
      if (!slackPayload.event) {
        throw new Error("Invalid event_callback - missing event");
      }

      const event = slackPayload.event;
      const eventType = event.type;
      const teamId = slackPayload.team_id ?? "unknown";

      if (
        shouldIgnoreEvent(
          slackPayload as Parameters<typeof shouldIgnoreEvent>[0],
          undefined,
        )
      ) {
        return;
      }

      const teamConfig: SlackTeamConfig = {
        teamId,
        organizationId: config.organizationId,
        meshUrl: config.meshUrl,
        botToken: "",
        signingSecret: "",
        configuredAt: new Date().toISOString(),
      };

      // Note: connectionId not available in legacy webhook path
      await handleSlackEvent(
        {
          type: eventType,
          payload: event,
          teamId,
        },
        teamConfig,
        "unknown",
      );
      return;
    }

    logger.warn(`Unknown payload type: ${slackPayload.type}`);
  } catch (error) {
    logger.error("Webhook processing error", {
      error: String(error),
    });
    throw error;
  }
}
