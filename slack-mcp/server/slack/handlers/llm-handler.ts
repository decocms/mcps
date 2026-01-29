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
    modelProviderId: config.modelProviderId,
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

/**
 * Call LLM with streaming and update Slack message in real-time
 */
export async function callLLMWithStreaming(
  messages: MessageWithImages[],
  options: LLMResponseOptions,
): Promise<string> {
  if (!globalLLMConfig) {
    throw new Error("LLM not configured");
  }

  const { channel, thinkingMessageTs, useBlocks = true } = options;

  if (!thinkingMessageTs) {
    // Fallback to non-streaming if no thinking message
    return callLLMWithoutStreaming(messages, options);
  }

  logger.info("LLM request started (streaming)", {
    channel: options.channel,
    messageCount: messages.length,
    hasConfig: !!globalLLMConfig,
    organizationId: globalLLMConfig?.organizationId,
    modelProviderId: globalLLMConfig?.modelProviderId,
    hasToken: !!globalLLMConfig?.token,
  });

  const response = await generateLLMResponseWithStreaming(
    messages,
    globalLLMConfig,
    async (text, isComplete) => {
      const formattedText = formatForSlack(text);
      const displayText = isComplete ? formattedText : formattedText + " ▌"; // Cursor indicator while streaming

      // Only use blocks for final message to avoid complexity
      const blocks =
        isComplete && useBlocks && text.length > 500
          ? buildResponseBlocks(text, { addFeedbackButtons: false })
          : undefined;

      await updateThinkingMessage(
        channel,
        thinkingMessageTs,
        displayText,
        blocks,
      );
    },
  );

  logger.info("LLM response sent successfully (streaming)", {
    channel: options.channel,
    responseLength: response.length,
  });
  return response;
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

  const { channel, replyTo, useBlocks = true } = options;

  logger.info("LLM request started (non-streaming)", {
    channel: options.channel,
    messageCount: messages.length,
  });

  const response = await generateLLMResponse(messages, globalLLMConfig);
  const formattedResponse = formatForSlack(response);
  const blocks =
    useBlocks && response.length > 500
      ? buildResponseBlocks(response, { addFeedbackButtons: false })
      : undefined;

  if (replyTo) {
    await replyInThread(channel, replyTo, formattedResponse, blocks);
  } else {
    await sendMessage({ channel, text: formattedResponse, blocks });
  }

  logger.info("LLM response sent successfully (non-streaming)", {
    channel: options.channel,
    responseLength: response.length,
  });
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

  try {
    // Use streaming only if enabled AND we have a thinking message to update
    const useStreaming = streamingEnabled && !!thinkingMessageTs;

    if (useStreaming) {
      await callLLMWithStreaming(messages, options);
    } else {
      await callLLMWithoutStreaming(messages, options);
    }
  } catch (error) {
    logger.error("LLM response failed", {
      channel,
      error: String(error),
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
