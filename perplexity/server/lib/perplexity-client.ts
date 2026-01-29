import { PERPLEXITY_BASE_URL } from "../constants.ts";
import type { ChatCompletion, ChatCompletionRequest } from "./types.ts";

export interface PerplexityClientConfig {
  apiKey: string;
}

async function chatCompletion(
  config: PerplexityClientConfig,
  request: ChatCompletionRequest,
): Promise<ChatCompletion> {
  const url = `${PERPLEXITY_BASE_URL}/chat/completions`;

  const response = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${config.apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(request),
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Perplexity API error: ${response.status} - ${error}`);
  }

  return response.json() as Promise<ChatCompletion>;
}

export const createPerplexityClient = (config: PerplexityClientConfig) => ({
  chatCompletion: (request: ChatCompletionRequest) =>
    chatCompletion(config, request),
});
