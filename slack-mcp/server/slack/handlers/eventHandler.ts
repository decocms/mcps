/**
 * Slack Event Handler
 *
 * Main event router for Slack events. For chat-style events (app_mention,
 * message) the handlers send a "Pensando..." placeholder and publish an
 * enriched trigger so a subscribed agent answers via SLACK_EDIT_MESSAGE
 * (or SLACK_REPLY_IN_THREAD). The legacy direct-LLM path (handleLLMCall,
 * buildLLMMessages) is no longer wired up — see PR description.
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
  getThreadReplies,
  sendThinkingMessage,
  processSlackFiles,
  deleteMessage,
} from "../../lib/slack-client.ts";
import type {
  SlackAppMentionEvent,
  SlackMessageEvent,
} from "../../lib/types.ts";
import { logger } from "../../lib/logger.ts";
import { shouldIgnoreEvent } from "../../webhook.ts";

// Import modular handlers
import {
  configureContext as setContextConfig,
  setBotUserId as setContextBotUserId,
  type ContextConfig,
} from "./context-builder.ts";

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
 * Per-handler timing metadata threaded in from the webhook router.
 *
 * `receivedAt` is the wall-clock ms the webhook hit the pod; `traceId`
 * matches the router-side log entries. Used only for perf-debug logs
 * — see `logPerfStep`. Optional so unit tests don't have to fake it.
 */
interface HandlerMeta {
  traceId?: string;
  receivedAt?: number;
}

/**
 * Emit a debug-level perf marker tagged with the cumulative pod time
 * since the webhook was received. Only flows to HyperDX when LOG_LEVEL=debug
 * (`logger.debug` is dropped below the configured min level — see logger.ts).
 */
function logPerfStep(
  step: string,
  meta: HandlerMeta,
  extras: Record<string, unknown> = {},
): void {
  if (!meta.receivedAt) return;
  logger.debug(`perf:${step}`, {
    step,
    trace_id: meta.traceId,
    duration_ms: Date.now() - meta.receivedAt,
    ...extras,
  });
}

/**
 * Append transcribed audio + text-file contents to the user's original text
 * so they flow through the trigger payload's `text` field. The lazy import of
 * `getLanguageFromFilename` mirrors the original eventHandler path and keeps
 * the language map out of the hot path when there are no files.
 */
async function appendFileContext(
  text: string,
  textFiles: Array<{ name: string; content: string; mimeType: string }>,
  transcriptions: string[],
): Promise<string> {
  let out = text;
  if (transcriptions.length > 0) {
    out += `\n\n${transcriptions.join("\n\n")}`;
  }
  if (textFiles.length > 0) {
    const { getLanguageFromFilename } = await import(
      "../../lib/slack-client.ts"
    );
    const textFileContent = textFiles
      .map(
        (file) =>
          `[File: ${file.name}]\n\`\`\`${getLanguageFromFilename(file.name)}\n${file.content}\n\`\`\``,
      )
      .join("\n\n");
    out += `\n\n${textFileContent}`;
  }
  return out;
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
  const { type, payload, traceId, receivedAt } = context;
  const meta: HandlerMeta = { traceId, receivedAt };

  const triggerOnly = teamConfig.responseConfig?.triggerOnly ?? false;

  switch (type) {
    case "app_mention":
      // Trigger publish and direct LLM handling are mutually exclusive:
      // in normal mode, handleAppMention runs the LLM and only falls back
      // to publishing a trigger inside handleLLMCall if the LLM call fails.
      // Publishing here AND running the LLM caused every message to be
      // answered twice (once by the LLM, once by the trigger subscriber).
      if (triggerOnly) {
        await publishAppMention(connectionId, payload);
        logPerfStep("trigger_published", meta, {
          mode: "triggerOnly",
          event_type: type,
        });
      } else {
        await handleAppMention(
          payload as SlackAppMentionEvent,
          teamConfig,
          connectionId,
          meta,
        );
      }
      break;
    case "message":
      if (triggerOnly) {
        await publishMessageReceived(connectionId, payload);
        logPerfStep("trigger_published", meta, {
          mode: "triggerOnly",
          event_type: type,
        });
      } else {
        await handleMessage(
          payload as SlackMessageEvent,
          teamConfig,
          connectionId,
          meta,
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
 * Handle @bot mentions.
 *
 * Fast path: send the "Pensando..." placeholder (which also creates the
 * thread under the user's message) and publish the enriched trigger so a
 * subscribed agent can answer. We do NOT call the LLM directly — that path
 * has been broken in production and the trigger flow is the source of truth
 * for the response now.
 */
async function handleAppMention(
  event: SlackAppMentionEvent,
  teamConfig: SlackTeamConfig,
  connectionId: string,
  meta: HandlerMeta = {},
): Promise<void> {
  const { channel, text, ts, thread_ts, files } = event;

  const showOnlyFinal =
    teamConfig.responseConfig?.showOnlyFinalResponse ?? false;
  const replyTo = thread_ts ?? ts;
  const showThinking = showOnlyFinal
    ? false
    : (teamConfig.responseConfig?.showThinkingMessage ?? true);

  const thinkingMsg = showThinking
    ? await sendThinkingMessage(channel, replyTo)
    : null;
  logPerfStep("thinking_sent", meta, {
    channel,
    has_thinking: Boolean(thinkingMsg?.ts),
    event_type: "app_mention",
  });

  const { textFiles, transcriptions, audioWithoutWhisper } =
    await processAttachedFiles(files);

  if (audioWithoutWhisper) {
    const warningMsg =
      "Audio detectado! Para processar arquivos de audio, e necessario ativar a integracao **Whisper** no Mesh.";
    await replyInThread(channel, replyTo, warningMsg);
    if (thinkingMsg?.ts) {
      await deleteMessage(channel, thinkingMsg.ts);
    }
    return;
  }

  const fullText = await appendFileContext(text, textFiles, transcriptions);

  await publishAppMention(
    connectionId,
    { ...event, text: fullText },
    { thinking_message_ts: thinkingMsg?.ts },
  );
  logPerfStep("trigger_published", meta, {
    channel,
    event_type: "app_mention",
  });
}

/**
 * Handle direct messages and channel messages.
 *
 * Routes by event shape — the handlers themselves are responsible for
 * sending "Pensando..." and publishing the trigger. We deliberately do NOT
 * process attached files here so the thinking message can fire before any
 * Whisper / file-download work.
 */
async function handleMessage(
  event: SlackMessageEvent,
  teamConfig: SlackTeamConfig,
  connectionId: string,
  meta: HandlerMeta = {},
): Promise<void> {
  const { channel, text, thread_ts, channel_type } = event;
  const isDM = channel_type === "im" || channel?.startsWith("D");
  const botUserId = globalBotUserId ?? teamConfig.botUserId;

  // Skip messages with bot mention in channels (handled by app_mention)
  if (!isDM && botUserId && text?.includes(`<@${botUserId}>`)) {
    return;
  }

  // For channel threads, only respond if the bot has participated
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

  // A DM that is a reply inside an existing thread continues in that thread;
  // a fresh top-level DM starts a brand-new thread under the user's message
  // (see handleDirectMessage). Channel messages only reach this branch when
  // thread_ts is set AND the bot has participated in that thread.
  if (isDM && thread_ts) {
    await handleThreadReply(event, thread_ts, teamConfig, connectionId, meta);
  } else if (isDM) {
    await handleDirectMessage(event, teamConfig, connectionId, meta);
  } else if (thread_ts) {
    await handleThreadReply(event, thread_ts, teamConfig, connectionId, meta);
  }
}

/**
 * Handle top-level direct messages.
 *
 * Every top-level DM kicks off a brand-new thread under the user's message
 * — "Pensando..." is sent with thread_ts=ts, which is what visually creates
 * the thread. Each subject ends up in its own thread.
 */
async function handleDirectMessage(
  event: SlackMessageEvent,
  teamConfig: SlackTeamConfig,
  connectionId: string,
  meta: HandlerMeta = {},
): Promise<void> {
  const { channel, text, ts, files } = event;

  const showOnlyFinal =
    teamConfig.responseConfig?.showOnlyFinalResponse ?? false;
  const replyTo = ts;
  const showThinking = showOnlyFinal
    ? false
    : (teamConfig.responseConfig?.showThinkingMessage ?? true);

  const thinkingMsg = showThinking
    ? await sendThinkingMessage(channel, replyTo)
    : null;
  logPerfStep("thinking_sent", meta, {
    channel,
    has_thinking: Boolean(thinkingMsg?.ts),
    event_type: "direct_message",
  });

  const { textFiles, transcriptions, audioWithoutWhisper } =
    await processAttachedFiles(files);

  if (audioWithoutWhisper) {
    const warningMsg =
      "Audio detectado! Para processar arquivos de audio, e necessario ativar a integracao **Whisper** no Mesh.";
    await replyInThread(channel, replyTo, warningMsg);
    if (thinkingMsg?.ts) {
      await deleteMessage(channel, thinkingMsg.ts);
    }
    return;
  }

  const fullText = await appendFileContext(text, textFiles, transcriptions);

  await publishMessageReceived(
    connectionId,
    { ...event, text: fullText },
    { thinking_message_ts: thinkingMsg?.ts },
  );
  logPerfStep("trigger_published", meta, {
    channel,
    event_type: "direct_message",
  });
}

/**
 * Handle thread replies (in a channel or inside a DM thread).
 */
async function handleThreadReply(
  event: SlackMessageEvent,
  threadTs: string,
  teamConfig: SlackTeamConfig,
  connectionId: string,
  meta: HandlerMeta = {},
): Promise<void> {
  const { channel, text, files } = event;

  const showOnlyFinal =
    teamConfig.responseConfig?.showOnlyFinalResponse ?? false;
  const showThinking = showOnlyFinal
    ? false
    : (teamConfig.responseConfig?.showThinkingMessage ?? true);

  const thinkingMsg = showThinking
    ? await sendThinkingMessage(channel, threadTs)
    : null;
  logPerfStep("thinking_sent", meta, {
    channel,
    has_thinking: Boolean(thinkingMsg?.ts),
    event_type: "thread_reply",
  });

  const { textFiles, transcriptions, audioWithoutWhisper } =
    await processAttachedFiles(files);

  if (audioWithoutWhisper) {
    const warningMsg =
      "Audio detectado! Para processar arquivos de audio, e necessario ativar a integracao **Whisper** no Mesh.";
    await replyInThread(channel, threadTs, warningMsg);
    if (thinkingMsg?.ts) {
      await deleteMessage(channel, thinkingMsg.ts);
    }
    return;
  }

  const fullText = await appendFileContext(text, textFiles, transcriptions);

  await publishMessageReceived(
    connectionId,
    { ...event, text: fullText },
    { thinking_message_ts: thinkingMsg?.ts },
  );
  logPerfStep("trigger_published", meta, {
    channel,
    event_type: "thread_reply",
  });
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
