/**
 * LLM Handler
 *
 * Handles LLM API calls and response formatting for Slack.
 * Consolidates streaming and non-streaming logic.
 */

import {
  generateLLMResponse,
  generateLLMResponseWithStreaming,
  type LLMConfig,
} from "../../lib/llm.ts";
import {
  replyInThread,
  sendMessage,
  updateThinkingMessage,
} from "../../lib/slack-client.ts";
import { formatForSlack, buildResponseBlocks } from "../../lib/format.ts";
import type { MessageWithImages } from "./context-builder.ts";
import { logger } from "../../lib/logger.ts";

// Global LLM config set by main.ts
let globalLLMConfig: LLMConfig | null = null;
let streamingEnabled = true; // Default to true

// Error messages (in English)
const ERROR_MESSAGES = {
  PROCESSING_ERROR:
    "Sorry, an error occurred while processing your message. Please try again.",
  GENERATION_FAILED: "Sorry, I couldn't generate a response.",
} as const;

/**
 * Configure the LLM settings
 */
export function configureLLM(config: LLMConfig): void {
  globalLLMConfig = config;
  console.log("[LLMHandler] Configured", {
    meshUrl: config.meshUrl,
    organizationId: config.organizationId,
    modelId: config.modelId,
    agentId: config.agentId,
    hasToken: !!config.token,
    hasSystemPrompt: !!config.systemPrompt,
  });
}

/**
 * Clear LLM configuration (prevents cross-tenant config leakage)
 */
export function clearLLMConfig(): void {
  globalLLMConfig = null;
  console.log("[LLMHandler] Config cleared");
}

/**
 * Configure streaming behavior
 */
export function configureStreaming(enabled: boolean): void {
  streamingEnabled = enabled;
  console.log("[LLMHandler] Streaming:", enabled ? "enabled" : "disabled");
}

/**
 * Check if streaming is enabled
 */
export function isStreamingEnabled(): boolean {
  return streamingEnabled;
}

/**
 * Check if LLM is configured
 */
export function isLLMConfigured(): boolean {
  return globalLLMConfig !== null;
}

/**
 * Get the current LLM config (for event bus fallback)
 */
export function getLLMConfig(): LLMConfig | null {
  return globalLLMConfig;
}

export interface LLMResponseOptions {
  channel: string;
  replyTo?: string;
  thinkingMessageTs?: string;
  useBlocks?: boolean;
}

const THINKING_FRAMES = [
  "🤔 Pensando",
  "🤔 Pensando.",
  "🤔 Pensando..",
  "🤔 Pensando...",
];
const THINKING_INTERVAL_MS = 800;

function startThinkingAnimation(
  channel: string,
  messageTs: string,
): { stop: () => void } {
  let frame = 0;
  let stopped = false;

  const timer = setInterval(() => {
    if (stopped) return;
    frame = (frame + 1) % THINKING_FRAMES.length;
    updateThinkingMessage(channel, messageTs, THINKING_FRAMES[frame]).catch(
      () => {},
    );
  }, THINKING_INTERVAL_MS);

  return {
    stop() {
      stopped = true;
      clearInterval(timer);
    },
  };
}

/**
 * Call LLM with streaming — animation runs until the final response is ready,
 * then the thinking message is replaced with the complete text.
 */
export async function callLLMWithStreaming(
  messages: MessageWithImages[],
  options: LLMResponseOptions,
): Promise<string> {
  if (!globalLLMConfig) {
    throw new Error("LLM not configured");
  }

  const { channel, thinkingMessageTs, useBlocks = true } = options;

  console.log(`[LLMHandler] ========== callLLMWithStreaming ==========`);
  console.log(
    `[LLMHandler] Channel: ${channel}, thinkingTs: ${thinkingMessageTs ?? "none"}`,
  );

  if (!thinkingMessageTs) {
    console.log(
      `[LLMHandler] No thinking message, falling back to non-streaming`,
    );
    return callLLMWithoutStreaming(messages, options);
  }

  const animation = startThinkingAnimation(channel, thinkingMessageTs);

  try {
    console.log(`[LLMHandler] Starting streaming LLM call...`);
    const streamStartTime = Date.now();
    const response = await generateLLMResponseWithStreaming(
      messages,
      globalLLMConfig,
      async (text, isComplete) => {
        if (!isComplete) return;

        animation.stop();
        console.log(
          `[LLMHandler] Streaming complete. Response length: ${text.length} chars, time: ${Date.now() - streamStartTime}ms`,
        );
        console.log(
          `[LLMHandler] Response preview: "${text.substring(0, 200)}"`,
        );

        const formattedText = formatForSlack(text);
        console.log(
          `[LLMHandler] Formatted text length: ${formattedText.length}, using blocks: ${useBlocks && text.length > 500}`,
        );
        const blocks =
          useBlocks && text.length > 500
            ? buildResponseBlocks(text, { addFeedbackButtons: false })
            : undefined;

        console.log(
          `[LLMHandler] Updating thinking message ${thinkingMessageTs} with final response`,
        );
        await updateThinkingMessage(
          channel,
          thinkingMessageTs,
          formattedText,
          blocks,
        );
        console.log(`[LLMHandler] Thinking message updated successfully`);
      },
    );

    return response;
  } finally {
    animation.stop();
  }
}

/**
 * Call LLM without streaming (fallback)
 */
export async function callLLMWithoutStreaming(
  messages: MessageWithImages[],
  options: LLMResponseOptions,
): Promise<string> {
  if (!globalLLMConfig) {
    throw new Error("LLM not configured");
  }

  const { channel, replyTo, thinkingMessageTs, useBlocks = true } = options;

  console.log(`[LLMHandler] ========== callLLMWithoutStreaming ==========`);
  console.log(
    `[LLMHandler] Channel: ${channel}, replyTo: ${replyTo ?? "none"}, thinkingTs: ${thinkingMessageTs ?? "none"}`,
  );
  const nonStreamStartTime = Date.now();
  console.log(`[LLMHandler] Starting non-streaming LLM call...`);
  const response = await generateLLMResponse(messages, globalLLMConfig);
  console.log(
    `[LLMHandler] Non-streaming LLM response received in ${Date.now() - nonStreamStartTime}ms. Length: ${response.length} chars`,
  );
  console.log(`[LLMHandler] Response preview: "${response.substring(0, 200)}"`);
  const formattedResponse = formatForSlack(response);
  console.log(
    `[LLMHandler] Formatted response length: ${formattedResponse.length}`,
  );
  const blocks =
    useBlocks && response.length > 500
      ? buildResponseBlocks(response, { addFeedbackButtons: false })
      : undefined;

  if (thinkingMessageTs) {
    console.log(
      `[LLMHandler] Updating thinking message ${thinkingMessageTs} with response`,
    );
    await updateThinkingMessage(
      channel,
      thinkingMessageTs,
      formattedResponse,
      blocks,
    );
    console.log(`[LLMHandler] Thinking message updated`);
  } else if (replyTo) {
    console.log(`[LLMHandler] Replying in thread ${replyTo}`);
    await replyInThread(channel, replyTo, formattedResponse, blocks);
    console.log(`[LLMHandler] Thread reply sent`);
  } else {
    console.log(`[LLMHandler] Sending message to channel ${channel}`);
    await sendMessage({ channel, text: formattedResponse, blocks });
    console.log(`[LLMHandler] Message sent`);
  }

  return response;
}

/**
 * Handle LLM call with error handling and Slack response
 * This is the main entry point for LLM calls
 */
export async function handleLLMCall(
  messages: MessageWithImages[],
  options: LLMResponseOptions,
): Promise<void> {
  const { channel, replyTo, thinkingMessageTs } = options;

  console.log(`[LLMHandler] ========== handleLLMCall ==========`);
  console.log(
    `[LLMHandler] Channel: ${channel}, replyTo: ${replyTo ?? "none"}, thinkingTs: ${thinkingMessageTs ?? "none"}`,
  );
  console.log(
    `[LLMHandler] Messages count: ${messages.length}, streaming enabled: ${streamingEnabled}`,
  );
  console.log(
    `[LLMHandler] LLM config: model=${globalLLMConfig?.modelId ?? "NOT SET"}, agentId=${globalLLMConfig?.agentId ?? "none"}, meshUrl=${globalLLMConfig?.meshUrl ?? "NOT SET"}`,
  );
  console.log(
    `[LLMHandler] Has system prompt: ${!!globalLLMConfig?.systemPrompt}`,
  );

  try {
    // Use streaming only if enabled AND we have a thinking message to update
    const useStreaming = streamingEnabled && !!thinkingMessageTs;
    console.log(
      `[LLMHandler] Using streaming: ${useStreaming} (streamingEnabled=${streamingEnabled}, hasThinkingMsg=${!!thinkingMessageTs})`,
    );

    const startTime = Date.now();
    if (useStreaming) {
      await callLLMWithStreaming(messages, options);
    } else {
      await callLLMWithoutStreaming(messages, options);
    }
    console.log(
      `[LLMHandler] LLM call completed successfully in ${Date.now() - startTime}ms`,
    );
  } catch (error) {
    logger.error("LLM response failed", {
      channel,
      error: String(error),
      errorStack: error instanceof Error ? error.stack : undefined,
      errorMessage: error instanceof Error ? error.message : String(error),
      messagesCount: messages.length,
    });

    const errorMsg = `❌ ${ERROR_MESSAGES.PROCESSING_ERROR}`;

    if (thinkingMessageTs) {
      await updateThinkingMessage(channel, thinkingMessageTs, errorMsg);
    } else if (replyTo) {
      await replyInThread(channel, replyTo, ERROR_MESSAGES.PROCESSING_ERROR);
    } else {
      await sendMessage({ channel, text: ERROR_MESSAGES.PROCESSING_ERROR });
    }

    throw error;
  }
}

/**
 * Send error message to Slack
 */
export async function sendErrorToSlack(
  channel: string,
  thinkingMessageTs?: string,
  replyTo?: string,
): Promise<void> {
  const errorMsg = ERROR_MESSAGES.PROCESSING_ERROR;

  if (thinkingMessageTs) {
    await updateThinkingMessage(channel, thinkingMessageTs, `❌ ${errorMsg}`);
  } else if (replyTo) {
    await replyInThread(channel, replyTo, errorMsg);
  } else {
    await sendMessage({ channel, text: errorMsg });
  }
}
