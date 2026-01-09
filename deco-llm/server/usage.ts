import type { LanguageModelInputSchema } from "@decocms/bindings/llm";
import type { ModelInfo } from "@decocms/openrouter/types";
import type { z } from "zod";

export interface GenerationContext {
  model: ModelInfo;
}

const DEFAULT_MAX_COMPLETION_TOKENS = 1000000;

export const toMicrodollars = (amount: number): string => {
  return Math.round(amount * 1_000_000).toString();
};
/**
 *
 * @param model - The model to calculate the pre-auth amount for
 * @param params - The parameters for the language model
 * @returns The pre-auth amount in microdollars
 */
export const calculatePreAuthAmount = (
  model: ModelInfo,
  params: z.infer<typeof LanguageModelInputSchema>,
): string => {
  const maxContextLength = Math.min(
    JSON.stringify({
      ...params.callOptions.prompt,
      ...params.callOptions.tools,
    }).length,
    model.context_length,
  );

  const maxCompletionTokens =
    params.callOptions.maxOutputTokens ??
    model.top_provider?.max_completion_tokens ??
    DEFAULT_MAX_COMPLETION_TOKENS;

  const constPerCompletionToken = parseFloat(model.pricing.completion);
  const constPerPromptToken = parseFloat(model.pricing.prompt);

  const amountUsd =
    maxContextLength * constPerPromptToken +
    maxCompletionTokens * constPerCompletionToken;
  return toMicrodollars(amountUsd);
};
