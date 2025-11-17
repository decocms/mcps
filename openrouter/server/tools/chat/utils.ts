/**
 * Utility functions for chat operations
 */

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
