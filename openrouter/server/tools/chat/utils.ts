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
  if (!Number.isFinite(promptTokens) || promptTokens < 0) {
    throw new Error("Prompt tokens must be a non-negative number");
  }
  if (!Number.isFinite(completionTokens) || completionTokens < 0) {
    throw new Error("Completion tokens must be a non-negative number");
  }

  const promptCostPerToken = parseFloat(pricing.prompt);
  const completionCostPerToken = parseFloat(pricing.completion);

  if (
    Number.isNaN(promptCostPerToken) ||
    Number.isNaN(completionCostPerToken)
  ) {
    throw new Error("Invalid pricing values returned by OpenRouter");
  }

  const promptCost = promptTokens * promptCostPerToken;
  const completionCost = completionTokens * completionCostPerToken;

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
  if (!Array.isArray(params.messages) || params.messages.length === 0) {
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
    if (params.topP < 0 || params.topP > 1) {
      throw new Error("Top P must be between 0 and 1 (inclusive)");
    }
  }
}
