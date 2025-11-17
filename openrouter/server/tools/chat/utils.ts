/**
 * Utility functions for chat operations
 */

import { STREAMING_SESSION_EXPIRY_MS } from "../../constants.ts";
import type {
  ChatMessage,
  ProviderPreferences,
  StreamingSession,
  ChatCompletionParams,
} from "../../lib/types.ts";

/**
 * Calculate cost for a chat completion based on token usage
 */
export function calculateChatCost(
  promptTokens: number,
  completionTokens: number,
  pricing: { prompt: string; completion: string },
): {
  prompt: number;
  completion: number;
  total: number;
} {
  const promptCostPer1M = parseFloat(pricing.prompt);
  const completionCostPer1M = parseFloat(pricing.completion);

  const promptCost = (promptTokens / 1_000_000) * promptCostPer1M;
  const completionCost = (completionTokens / 1_000_000) * completionCostPer1M;

  return {
    prompt: Number(promptCost.toFixed(6)),
    completion: Number(completionCost.toFixed(6)),
    total: Number((promptCost + completionCost).toFixed(6)),
  };
}

/**
 * Rough estimate of tokens in messages
 * Note: This is a rough approximation. Actual tokenization varies by model.
 * For accurate counts, use the API response.
 */
export function estimateTokens(messages: ChatMessage[]): number {
  let totalChars = 0;

  for (const message of messages) {
    if (typeof message.content === "string") {
      totalChars += message.content.length;
    } else if (Array.isArray(message.content)) {
      for (const part of message.content) {
        if (part.type === "text" && part.text) {
          totalChars += part.text.length;
        }
        // Images are harder to estimate, roughly 85 tokens per image
        if (part.type === "image_url") {
          totalChars += 85 * 4; // Rough approximation
        }
      }
    }
    // Add tokens for role and formatting
    totalChars += 20;
  }

  // Rough approximation: ~4 characters per token
  return Math.ceil(totalChars / 4);
}

/**
 * Validate chat completion parameters
 */
export function validateChatParams(params: {
  messages?: unknown[];
  model?: string;
  temperature?: number;
  maxTokens?: number;
  topP?: number;
}): void {
  if (!params.messages || params.messages.length === 0) {
    throw new Error("Messages array is required and cannot be empty");
  }

  if (params.temperature !== undefined) {
    if (params.temperature < 0 || params.temperature > 2) {
      throw new Error("Temperature must be between 0 and 2");
    }
  }

  if (params.maxTokens !== undefined) {
    if (params.maxTokens < 1) {
      throw new Error("Max tokens must be at least 1");
    }
  }

  if (params.topP !== undefined) {
    if (params.topP <= 0 || params.topP > 1) {
      throw new Error("Top P must be between 0 (exclusive) and 1 (inclusive)");
    }
  }
}

/**
 * Generate a unique session ID
 */
function generateSessionId(): string {
  const timestamp = Date.now().toString(36);
  const randomPart = Math.random().toString(36).substring(2, 15);
  return `${timestamp}-${randomPart}`;
}

/**
 * Create a streaming session with expiry
 */
export function createStreamingSession(
  params: ChatCompletionParams,
): StreamingSession {
  const sessionId = generateSessionId();
  const createdAt = Date.now();
  const expiresAt = createdAt + STREAMING_SESSION_EXPIRY_MS;

  return {
    sessionId,
    params,
    createdAt,
    expiresAt,
  };
}

/**
 * Build streaming URL for a session
 */
export function buildStreamingUrl(baseUrl: string, sessionId: string): string {
  // Remove trailing slash from baseUrl
  const cleanBaseUrl = baseUrl.replace(/\/$/, "");
  return `${cleanBaseUrl}/api/stream/${sessionId}`;
}

/**
 * Format provider preferences for OpenRouter API
 */
export function formatProviderPreferences(
  provider?: ProviderPreferences,
): ProviderPreferences | undefined {
  if (!provider) return undefined;

  // Return as-is, OpenRouter API accepts this format
  return provider;
}

/**
 * Check if a streaming session is expired
 */
export function isSessionExpired(session: StreamingSession): boolean {
  return Date.now() > session.expiresAt;
}

/**
 * Get friendly instructions for consuming a stream
 */
export function getStreamingInstructions(): string {
  return (
    "Connect to the streamUrl using an EventSource or SSE client. " +
    "The stream will send Server-Sent Events (SSE) with 'data: ' prefix. " +
    "Each event contains a JSON chunk with partial completion data. " +
    "The stream ends with 'data: [DONE]' message. " +
    "Session expires after 5 minutes."
  );
}
