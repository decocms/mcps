import { PERPLEXITY_BASE_URL } from "../constants";
import { makeApiRequest } from "@decocms/mcps-shared/tools/utils/api-client";
import type { ChatCompletion, ChatCompletionRequest } from "./types";

export interface PerplexityClientConfig {
  apiKey: string;
}

export class PerplexityClient {
  private apiKey: string;

  constructor(config: PerplexityClientConfig) {
    this.apiKey = config.apiKey;
  }

  private getHeaders(): Record<string, string> {
    return {
      Authorization: `Bearer ${this.apiKey}`,
      "Content-Type": "application/json",
    };
  }

  async chatCompletion(
    request: ChatCompletionRequest,
  ): Promise<ChatCompletion> {
    const url = `${PERPLEXITY_BASE_URL}/chat/completions`;

    return await makeApiRequest(
      url,
      {
        method: "POST",
        headers: this.getHeaders(),
        body: JSON.stringify(request),
      },
      "Perplexity",
    );
  }
}
