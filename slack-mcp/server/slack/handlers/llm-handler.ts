/**
 * LLM Handler
 *
 * Handles agent calls and response formatting for Slack.
 * Uses AgentOf().STREAM() binding via the connection instance.
 */

import {
  isAgentAvailable,
  streamAgentResponse,
  collectStreamText,
} from "../../llm.ts";
import {
  replyInThread,
  sendMessage,
  updateThinkingMessage,
} from "../../lib/slack-client.ts";
import { formatForSlack, buildResponseBlocks } from "../../lib/format.ts";
import type { MessageWithImages } from "./context-builder.ts";
import { logger } from "../../lib/logger.ts";

const ERROR_MESSAGES = {
  PROCESSING_ERROR:
    "Sorry, an error occurred while processing your message. Please try again.",
  GENERATION_FAILED: "Sorry, I couldn't generate a response.",
} as const;

/**
 * Strip leaked tool-call patterns from agent text responses.
 * Some agents output tool calls as plain text (e.g. TOOL_NAME(arg: value, ...))
 * instead of using the proper tool-calling format.
 */
function stripLeakedToolCalls(text: string): string {
  // Match UPPER_CASE_NAME(...) patterns that look like tool calls
  return text.replace(/\s*[A-Z][A-Z_]{2,}\([^)]*\)\s*/g, " ").trim();
}

export interface LLMResponseOptions {
  channel: string;
  replyTo?: string;
  thinkingMessageTs?: string;
  useBlocks?: boolean;
  streamingEnabled?: boolean;
}

const THINKING_FRAMES = ["Pensando", "Pensando.", "Pensando..", "Pensando..."];
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
 * Check if the agent is configured for a connection
 */
export function isLLMConfigured(connectionId: string): boolean {
  return isAgentAvailable(connectionId);
}

/**
 * Call agent with streaming — animation runs until the final response is ready,
 * then the thinking message is replaced with the complete text.
 */
async function callWithStreaming(
  connectionId: string,
  messages: MessageWithImages[],
  options: LLMResponseOptions,
): Promise<string> {
  const { channel, thinkingMessageTs, useBlocks = true } = options;

  if (!thinkingMessageTs) {
    return callWithoutStreaming(connectionId, messages, options);
  }

  const animation = startThinkingAnimation(channel, thinkingMessageTs);

  try {
    const stream = await streamAgentResponse(connectionId, messages);
    const rawText = await collectStreamText(stream);

    animation.stop();

    const text = stripLeakedToolCalls(rawText);

    if (!text.trim()) {
      await updateThinkingMessage(
        channel,
        thinkingMessageTs,
        ERROR_MESSAGES.GENERATION_FAILED,
      );
      return "";
    }

    const formattedText = formatForSlack(text);
    const blocks =
      useBlocks && text.length > 500
        ? buildResponseBlocks(text, { addFeedbackButtons: false })
        : undefined;

    await updateThinkingMessage(
      channel,
      thinkingMessageTs,
      formattedText,
      blocks,
    );

    return text;
  } finally {
    animation.stop();
  }
}

/**
 * Call agent without streaming (fallback)
 */
async function callWithoutStreaming(
  connectionId: string,
  messages: MessageWithImages[],
  options: LLMResponseOptions,
): Promise<string> {
  const { channel, replyTo, thinkingMessageTs, useBlocks = true } = options;

  const stream = await streamAgentResponse(connectionId, messages);
  const response = stripLeakedToolCalls(await collectStreamText(stream));

  if (!response.trim()) {
    const fallback = ERROR_MESSAGES.GENERATION_FAILED;
    if (thinkingMessageTs) {
      await updateThinkingMessage(channel, thinkingMessageTs, fallback);
    } else if (replyTo) {
      await replyInThread(channel, replyTo, fallback);
    } else {
      await sendMessage({ channel, text: fallback });
    }
    return "";
  }

  const formattedResponse = formatForSlack(response);
  const blocks =
    useBlocks && response.length > 500
      ? buildResponseBlocks(response, { addFeedbackButtons: false })
      : undefined;

  if (thinkingMessageTs) {
    await updateThinkingMessage(
      channel,
      thinkingMessageTs,
      formattedResponse,
      blocks,
    );
  } else if (replyTo) {
    await replyInThread(channel, replyTo, formattedResponse, blocks);
  } else {
    await sendMessage({ channel, text: formattedResponse, blocks });
  }

  return response;
}

/**
 * Handle agent call with error handling and Slack response.
 * This is the main entry point for LLM calls.
 */
export async function handleLLMCall(
  connectionId: string,
  messages: MessageWithImages[],
  options: LLMResponseOptions,
): Promise<void> {
  const {
    channel,
    replyTo,
    thinkingMessageTs,
    streamingEnabled = true,
  } = options;

  try {
    const useStreaming = streamingEnabled && !!thinkingMessageTs;

    if (useStreaming) {
      await callWithStreaming(connectionId, messages, options);
    } else {
      await callWithoutStreaming(connectionId, messages, options);
    }
  } catch (error) {
    logger.error("LLM response failed", {
      channel,
      error: String(error),
      errorStack: error instanceof Error ? error.stack : undefined,
      errorMessage: error instanceof Error ? error.message : String(error),
      messagesCount: messages.length,
    });

    const errorMsg = `${ERROR_MESSAGES.PROCESSING_ERROR}`;

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
    await updateThinkingMessage(channel, thinkingMessageTs, errorMsg);
  } else if (replyTo) {
    await replyInThread(channel, replyTo, errorMsg);
  } else {
    await sendMessage({ channel, text: errorMsg });
  }
}
