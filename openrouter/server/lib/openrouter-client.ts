/**
 * OpenRouter API client
 * Handles all communication with the OpenRouter API
 */

import {
  OPENROUTER_BASE_URL,
  OPENROUTER_CHAT_ENDPOINT,
  OPENROUTER_GENERATION_ENDPOINT,
  OPENROUTER_MODELS_ENDPOINT,
} from "../constants.ts";
import type {
  ChatCompletionChunk,
  ChatCompletionParams,
  ChatCompletionResponse,
  GenerationInfo,
  ModelInfo,
} from "./types.ts";

export interface OpenRouterClientConfig {
  apiKey: string;
  siteName?: string;
  siteUrl?: string;
}

const MODEL_CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes

interface CachedModelEntry {
  model: ModelInfo;
  fetchedAt: number;
}

export class OpenRouterClient {
  private apiKey: string;
  private baseUrl: string;
  private headers: Record<string, string>;
  private modelCache: Map<string, CachedModelEntry>;

  constructor(config: OpenRouterClientConfig) {
    this.apiKey = config.apiKey;
    this.baseUrl = OPENROUTER_BASE_URL;
    this.modelCache = new Map();

    this.headers = {
      Authorization: `Bearer ${this.apiKey}`,
      "Content-Type": "application/json",
    };

    if (config.siteUrl) {
      this.headers["HTTP-Referer"] = config.siteUrl;
    }
    if (config.siteName) {
      this.headers["X-Title"] = config.siteName;
    }
  }

  /**
   * List all available models
   */
  async listModels(): Promise<ModelInfo[]> {
    const url = `${this.baseUrl}${OPENROUTER_MODELS_ENDPOINT}`;

    const response = await fetch(url, {
      method: "GET",
      headers: this.headers,
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(
        `Failed to list models: ${response.status} ${response.statusText} - ${error}`,
      );
    }

    const data = (await response.json()) as { data?: ModelInfo[] };
    const models = data.data || [];

    // Prime cache
    const fetchedAt = Date.now();
    for (const model of models) {
      this.modelCache.set(model.id, { model, fetchedAt });
    }

    return models;
  }

  /**
   * Get detailed information about a specific model
   */
  async getModel(modelId: string): Promise<ModelInfo> {
    const cached = this.modelCache.get(modelId);
    if (cached && Date.now() - cached.fetchedAt < MODEL_CACHE_TTL_MS) {
      return cached.model;
    }

    const url = `${this.baseUrl}${OPENROUTER_MODELS_ENDPOINT}/${encodeURIComponent(
      modelId,
    )}`;

    const response = await fetch(url, {
      method: "GET",
      headers: this.headers,
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(
        `Failed to get model: ${response.status} ${response.statusText} - ${error}`,
      );
    }

    const data = (await response.json()) as { data: ModelInfo };
    const model = data.data;

    this.modelCache.set(modelId, { model, fetchedAt: Date.now() });

    return model;
  }

  /**
   * Send a chat completion request (non-streaming)
   */
  async chatCompletion(
    params: ChatCompletionParams,
  ): Promise<ChatCompletionResponse> {
    const url = `${this.baseUrl}${OPENROUTER_CHAT_ENDPOINT}`;

    const body = this.prepareChatParams(params);
    body.stream = false;

    const response = await fetch(url, {
      method: "POST",
      headers: this.headers,
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(
        `Chat completion failed: ${response.status} ${response.statusText} - ${error}`,
      );
    }

    return await response.json();
  }

  /**
   * Stream a chat completion (returns async generator)
   */
  async *streamChatCompletion(
    params: ChatCompletionParams,
  ): AsyncGenerator<ChatCompletionChunk> {
    const url = `${this.baseUrl}${OPENROUTER_CHAT_ENDPOINT}`;

    const body = this.prepareChatParams(params);
    body.stream = true;

    const response = await fetch(url, {
      method: "POST",
      headers: this.headers,
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(
        `Stream chat completion failed: ${response.status} ${response.statusText} - ${error}`,
      );
    }

    const reader = response.body?.getReader();
    if (!reader) {
      throw new Error("Response body is not readable");
    }

    const decoder = new TextDecoder();
    let buffer = "";

    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() || "";

        for (const line of lines) {
          const trimmed = line.trim();
          if (!trimmed || trimmed === "data: [DONE]") continue;
          if (!trimmed.startsWith("data: ")) continue;

          try {
            const json = trimmed.slice(6); // Remove "data: " prefix
            const chunk = JSON.parse(json) as ChatCompletionChunk;
            yield chunk;
          } catch (e) {
            // Ignore malformed chunks
            console.warn("Failed to parse chunk:", trimmed, e);
          }
        }
      }
    } finally {
      reader.releaseLock();
    }
  }

  /**
   * Get generation information by ID
   */
  async getGeneration(generationId: string): Promise<GenerationInfo> {
    const url = `${this.baseUrl}${OPENROUTER_GENERATION_ENDPOINT}?id=${generationId}`;

    const response = await fetch(url, {
      method: "GET",
      headers: this.headers,
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(
        `Failed to get generation info: ${response.status} ${response.statusText} - ${error}`,
      );
    }

    const data = (await response.json()) as { data: GenerationInfo };
    return data.data;
  }

  /**
   * Prepare chat parameters for API request
   * Converts camelCase to snake_case and formats properly
   */
  private prepareChatParams(
    params: ChatCompletionParams,
  ): Record<string, unknown> {
    const body: Record<string, unknown> = {
      model: params.model,
      messages: params.messages,
    };

    // Add optional parameters
    if (params.temperature !== undefined) body.temperature = params.temperature;
    if (params.max_tokens !== undefined) body.max_tokens = params.max_tokens;
    if (params.top_p !== undefined) body.top_p = params.top_p;
    if (params.top_k !== undefined) body.top_k = params.top_k;
    if (params.frequency_penalty !== undefined)
      body.frequency_penalty = params.frequency_penalty;
    if (params.presence_penalty !== undefined)
      body.presence_penalty = params.presence_penalty;
    if (params.repetition_penalty !== undefined)
      body.repetition_penalty = params.repetition_penalty;
    if (params.min_p !== undefined) body.min_p = params.min_p;
    if (params.top_a !== undefined) body.top_a = params.top_a;
    if (params.seed !== undefined) body.seed = params.seed;
    if (params.logit_bias !== undefined) body.logit_bias = params.logit_bias;
    if (params.logprobs !== undefined) body.logprobs = params.logprobs;
    if (params.top_logprobs !== undefined)
      body.top_logprobs = params.top_logprobs;
    if (params.response_format !== undefined)
      body.response_format = params.response_format;
    if (params.stop !== undefined) body.stop = params.stop;
    if (params.tools !== undefined) body.tools = params.tools;
    if (params.tool_choice !== undefined) body.tool_choice = params.tool_choice;
    if (params.transforms !== undefined) body.transforms = params.transforms;
    if (params.models !== undefined) body.models = params.models;
    if (params.route !== undefined) body.route = params.route;
    if (params.provider !== undefined) body.provider = params.provider;
    if (params.user !== undefined) body.user = params.user;

    return body;
  }
}
