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
  deleteMessage,
} from "../../lib/slack-client.ts";
import type {
  SlackEvent,
  SlackAppMentionEvent,
  SlackMessageEvent,
} from "../../lib/types.ts";
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
    showOnlyFinalResponse?: boolean;
    enableStreaming?: boolean;
    showThinkingMessage?: boolean;
  };
};
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

    // Use localhost for LOCAL tunnel URLs only (not production)
    const isLocalTunnel =
      whisperConfig.meshUrl.includes("localhost") &&
      whisperConfig.meshUrl.includes(".deco.host");
    const effectiveMeshUrl = isLocalTunnel
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

  // Separate text files from media files
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

  // Check if there are audio files
  const hasAudio = mediaFiles.some((f) => f.type === "audio");
  const whisperConfigured = whisperConfig !== null;

  // If audio without Whisper, return only images and set warning flag
  if (hasAudio && !whisperConfigured) {
    console.warn(
      "[EventHandler] ⚠️ Audio files detected but Whisper not configured - skipping audio",
    );
    const onlyImages = mediaFiles.filter((f) => f.type === "image");
    return {
      media: onlyImages,
      textFiles,
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
    for (const processedFile of mediaFiles) {
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
    images: mediaFiles.filter((f) => f.type === "image").length,
    audio: mediaFiles.filter((f) => f.type === "audio").length,
    textFiles: textFiles.length,
    transcriptions: transcriptions.length,
  });

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

  // Log app mention received
  logger.debug("App mention received", {
    connectionId: teamConfig.teamId,
    teamId: teamConfig.teamId,
    teamName: (teamConfig as any).teamName,
    organizationId: teamConfig.organizationId,
    eventType: "app_mention",
    channel,
    userId: user,
    hasText: !!text,
    textLength: text?.length || 0,
    hasFiles: !!files?.length,
  });

  // Check if we're in "show only final response" mode
  const showOnlyFinal =
    teamConfig.responseConfig?.showOnlyFinalResponse ?? false;

  // Add eyes reaction immediately for quick feedback (unless in silent mode)
  if (!showOnlyFinal) {
    await addReaction(channel, ts, "eyes");
  }

  // Send thinking message if enabled (respects showOnlyFinal override)
  const replyTo = thread_ts ?? ts;
  const showThinking = showOnlyFinal
    ? false
    : (teamConfig.responseConfig?.showThinkingMessage ?? true);
  const thinkingMsg = showThinking
    ? await sendThinkingMessage(channel, replyTo)
    : null;

  // Remove eyes reaction when we start processing (unless in silent mode)
  if (!showOnlyFinal) {
    await removeReaction(channel, ts, "eyes");
  }

  // Process attached files (images, audio, and text files)
  const { media, textFiles, transcriptions, audioWithoutWhisper } =
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

  // Format text files for LLM
  const { getLanguageFromFilename } = await import("../../lib/slack-client.ts");
  const textFileContent = textFiles
    .map((file) => {
      const language = getLanguageFromFilename(file.name);
      return `[File: ${file.name}]\n\`\`\`${language}\n${file.content}\n\`\`\``;
    })
    .join("\n\n");

  // Add transcriptions and text files to the message text
  let fullText = text;
  if (transcriptions.length > 0) {
    fullText += `\n\n${transcriptions.join("\n\n")}`;
  }
  if (textFileContent) {
    fullText += `\n\n${textFileContent}`;
  }

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

  // Check if LLM is configured
  if (!isLLMConfigured()) {
    const warningMsg =
      "⚠️ Por favor, configure um LLM (Language Model) no Mesh para usar o bot.\n\n" +
      "Acesse as configurações da conexão no Mesh e selecione um provedor de modelo (como OpenAI, Anthropic, etc.).";

    await replyInThread(channel, replyTo, warningMsg);
    console.log(
      "[EventHandler] LLM not configured - sent configuration warning",
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
    logger.debug("App mention response sent", {
      channel,
      userId: user,
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

  // Process attached files (images, audio, and text files)
  const { media, textFiles, transcriptions, audioWithoutWhisper } =
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

  // Format text files for LLM
  const { getLanguageFromFilename } = await import("../../lib/slack-client.ts");
  const textFileContent = textFiles
    .map((file) => {
      const language = getLanguageFromFilename(file.name);
      return `[File: ${file.name}]\n\`\`\`${language}\n${file.content}\n\`\`\``;
    })
    .join("\n\n");

  // Add transcriptions and text files to the message text
  let fullText = text;
  if (transcriptions.length > 0) {
    fullText += `\n\n${transcriptions.join("\n\n")}`;
  }
  if (textFileContent) {
    fullText += `\n\n${textFileContent}`;
  }

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
      teamConfig,
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
      teamConfig,
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
  teamConfig: SlackTeamConfig,
): Promise<void> {
  console.log(`[EventHandler] DM from ${user}`);

  // Log direct message received
  logger.debug("Direct message received", {
    connectionId: teamConfig.teamId,
    teamId: teamConfig.teamId,
    teamName: (teamConfig as any).teamName,
    organizationId: teamConfig.organizationId,
    eventType: "message",
    channel,
    userId: user,
    hasText: !!text,
    textLength: text?.length || 0,
    hasMedia: !!media?.length,
  });

  // Check if we're in "show only final response" mode
  const showOnlyFinal =
    teamConfig.responseConfig?.showOnlyFinalResponse ?? false;

  // Add eyes reaction immediately for quick feedback (unless in silent mode)
  if (!showOnlyFinal) {
    await addReaction(channel, ts, "eyes");
  }

  // Send thinking message if enabled (respects showOnlyFinal override)
  const showThinking = showOnlyFinal
    ? false
    : (teamConfig.responseConfig?.showThinkingMessage ?? true);
  const thinkingMsg = showThinking ? await sendThinkingMessage(channel) : null;

  // Remove eyes reaction when we start processing (unless in silent mode)
  if (!showOnlyFinal) {
    await removeReaction(channel, ts, "eyes");
  }

  const messages = await buildLLMMessages(channel, text, ts, undefined, media);

  if (!isLLMConfigured()) {
    const warningMsg =
      "⚠️ Por favor, configure um LLM (Language Model) no Mesh para usar o bot.\n\n" +
      "Acesse as configurações da conexão no Mesh e selecione um provedor de modelo (como OpenAI, Anthropic, etc.).";

    await sendMessage({ channel, text: warningMsg });

    // Delete the thinking message if it exists
    if (thinkingMsg?.ts) {
      await deleteMessage(channel, thinkingMsg.ts);
    }

    console.log(
      "[EventHandler] LLM not configured - sent configuration warning",
    );
    return;
  }

  try {
    await handleLLMCall(messages, {
      channel,
      thinkingMessageTs: thinkingMsg?.ts,
    });
    logger.debug("Direct message response sent", {
      channel,
      userId: user,
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
  meshConfig: MeshConfig,
  teamConfig: SlackTeamConfig,
): Promise<void> {
  console.log(`[EventHandler] Thread reply from ${user}`);

  // Log thread reply received
  logger.debug("Thread reply received", {
    connectionId: teamConfig.teamId,
    teamId: teamConfig.teamId,
    teamName: (teamConfig as any).teamName,
    organizationId: teamConfig.organizationId,
    eventType: "message",
    channel,
    userId: user,
    hasText: !!text,
    textLength: text?.length || 0,
    hasMedia: !!media?.length,
    threadTs,
  });

  // Check if we're in "show only final response" mode
  const showOnlyFinal =
    teamConfig.responseConfig?.showOnlyFinalResponse ?? false;

  // Add eyes reaction immediately for quick feedback (unless in silent mode)
  if (!showOnlyFinal) {
    await addReaction(channel, ts, "eyes");
  }

  // Send thinking message if enabled (respects showOnlyFinal override)
  const showThinking = showOnlyFinal
    ? false
    : (teamConfig.responseConfig?.showThinkingMessage ?? true);
  const thinkingMsg = showThinking
    ? await sendThinkingMessage(channel, threadTs)
    : null;

  // Remove eyes reaction when we start processing (unless in silent mode)
  if (!showOnlyFinal) {
    await removeReaction(channel, ts, "eyes");
  }

  const messages = await buildLLMMessages(channel, text, ts, threadTs, media);

  if (!isLLMConfigured()) {
    const warningMsg =
      "⚠️ Por favor, configure um LLM (Language Model) no Mesh para usar o bot.\n\n" +
      "Acesse as configurações da conexão no Mesh e selecione um provedor de modelo (como OpenAI, Anthropic, etc.).";

    await replyInThread(channel, threadTs, warningMsg);

    // Delete the thinking message if it exists
    if (thinkingMsg?.ts) {
      await deleteMessage(channel, thinkingMsg.ts);
    }

    console.log(
      "[EventHandler] LLM not configured - sent configuration warning",
    );
    return;
  }

  try {
    await handleLLMCall(messages, {
      channel,
      replyTo: threadTs,
      thinkingMessageTs: thinkingMsg?.ts,
    });
    logger.debug("Thread reply response sent", {
      channel,
      userId: user,
      threadTs,
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

  await logger.debug("LLM Response Received", {
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
      logger.info("Message sent", {
        channel,
        hasText: !!text,
        textLength: text?.length || 0,
      });
      const threadIdentifier = threadTs ?? messageTs ?? responseTs;
      await appendAssistantMessage(channel, threadIdentifier, text, responseTs);
    }
  } catch (error) {
    // Handle specific Slack API errors
    const errorMessage = String(error);

    if (errorMessage.includes("channel_not_found")) {
      await logger.warn("Channel not found - bot may not be in this channel", {
        channel,
        error: "channel_not_found",
        help: "Add the bot to the channel or check if channel exists",
      });
      console.warn(
        `[Event Handler] ⚠️ Cannot send message - channel ${channel} not found or bot not added`,
      );
      return; // Don't throw, just log and continue
    }

    if (errorMessage.includes("not_in_channel")) {
      await logger.warn("Bot not in channel", {
        channel,
        error: "not_in_channel",
        help: "Invite the bot to the channel with /invite @bot",
      });
      console.warn(
        `[Event Handler] ⚠️ Cannot send message - bot not in channel ${channel}`,
      );
      return; // Don't throw, just log and continue
    }

    // For other errors, log and throw
    await logger.error("Failed to send message", { error: errorMessage });
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
  try {
    console.log("[EventHandler] ========================================");
    console.log("[EventHandler] Processing webhook from Mesh");

    // Validate payload
    if (!payload || typeof payload !== "object") {
      throw new Error("Invalid webhook payload - expected object");
    }

    const slackPayload = payload as SlackWebhookPayload;

    logger.debug("Webhook payload parsed", {
      type: slackPayload.type,
      teamId: slackPayload.team_id,
      hasEvent: !!slackPayload.event,
    });

    // Handle URL verification
    if (slackPayload.type === "url_verification") {
      logger.debug("URL verification challenge handled");
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

    logger.warn(`Unknown payload type: ${slackPayload.type}`);
  } catch (error) {
    logger.error("Webhook processing error", {
      error: String(error),
    });
    throw error;
  }
}

/**
 * Handle event_callback payload type
 */
async function handleEventCallback(
  slackPayload: SlackWebhookPayload,
  config: MeshConfig,
): Promise<void> {
  logger.debug("Event callback received", {
    hasEvent: !!slackPayload.event,
    eventType: slackPayload.event?.type,
  });

  if (!slackPayload.event) {
    throw new Error("Invalid event_callback - missing event");
  }

  const event = slackPayload.event;
  const eventType = event.type;
  const teamId = slackPayload.team_id ?? "unknown";

  // Check if we should ignore this event (bot messages)
  if (
    shouldIgnoreEvent(
      slackPayload as Parameters<typeof shouldIgnoreEvent>[0],
      undefined,
    )
  ) {
    console.log("[EventHandler] Ignoring bot/ignored event");
    return;
  }

  logger.debug("Event received", {
    eventType,
    user: event.user,
    channel: event.channel,
    text: event.text?.substring(0, 100),
  });

  // Create team config from current context
  const teamConfig: SlackTeamConfig = {
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
    logger.error("Event handling failed", {
      eventType,
      error: String(error),
    });
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
  // context is kept for future use (e.g., event logging)

  switch (eventType) {
    case "app_mention":
      logger.debug(`Handling app_mention`);
      await handleAppMention(event as SlackAppMentionEvent, teamConfig);
      break;

    case "message":
      logger.debug(`Handling message`);
      await handleMessage(event as SlackMessageEvent, teamConfig);
      break;

    case "reaction_added":
      logger.debug(`Handling reaction_added`);
      await handleReactionAdded(event, teamConfig);
      break;

    case "channel_created":
      logger.debug(`Handling channel_created`);
      await handleChannelCreated(event, teamConfig);
      break;

    case "member_joined_channel":
      logger.debug(`Handling member_joined_channel`);
      await handleMemberJoined(event, teamConfig);
      break;

    default:
      await logger.warn(`Unhandled event type: ${eventType}`);
  }
}
