import { PERPLEXITY_BASE_URL } from "../constants";
import { makeApiRequest } from "@decocms/mcps-shared/tools/utils/api-client";
import type { ChatCompletion, ChatCompletionRequest } from "./types";

export interface PerplexityClientConfig {
  apiKey: string;
}

async function chatCompletion(
  config: PerplexityClientConfig,
  request: ChatCompletionRequest,
): Promise<ChatCompletion> {
  const url = `${PERPLEXITY_BASE_URL}/chat/completions`;

  return await makeApiRequest(
    url,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${config.apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(request),
    },
    "Perplexity",
  );
}

export const createPerplexityClient = (config: PerplexityClientConfig) => ({
  chatCompletion: (request: ChatCompletionRequest) =>
    chatCompletion(config, request),
});
