/**
 * Google Gemini API client
 * Handles model listing and metadata retrieval from the Gemini REST API.
 */

import {
  DEFAULT_PRICING,
  GEMINI_BASE_URL,
  GEMINI_MODELS_ENDPOINT,
  GEMINI_PRICING,
} from "../constants.ts";
import type {
  GeminiApiModel,
  GeminiListModelsResponse,
  ModelInfo,
} from "./types.ts";

export interface GeminiClientConfig {
  apiKey: string;
}

const MODEL_CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes

interface CachedModelEntry {
  model: ModelInfo;
  fetchedAt: number;
}

export class GeminiClient {
  private apiKey: string;
  private modelCache: Map<string, CachedModelEntry>;

  constructor(config: GeminiClientConfig) {
    this.apiKey = config.apiKey;
    this.modelCache = new Map();
  }

  static for(apiKey: string): GeminiClient {
    return new GeminiClient({ apiKey });
  }

  /**
   * List all available models from the Gemini API.
   * Paginates through all pages and returns a normalized ModelInfo array.
   */
  async listModels(): Promise<ModelInfo[]> {
    const allApiModels: GeminiApiModel[] = [];
    let pageToken: string | undefined;

    do {
      const url = new URL(`${GEMINI_BASE_URL}${GEMINI_MODELS_ENDPOINT}`);
      url.searchParams.set("key", this.apiKey);
      url.searchParams.set("pageSize", "1000");
      if (pageToken) {
        url.searchParams.set("pageToken", pageToken);
      }

      const response = await fetch(url.toString());
      if (!response.ok) {
        const body = await response.text();
        throw new Error(`Gemini API error (${response.status}): ${body}`);
      }

      const data: GeminiListModelsResponse = await response.json();
      allApiModels.push(...(data.models ?? []));
      pageToken = data.nextPageToken;
    } while (pageToken);

    // Filter to only models that support generateContent (actual LLMs)
    const generativeModels = allApiModels.filter((m) =>
      m.supportedGenerationMethods.includes("generateContent"),
    );

    const converted = generativeModels.map((model) => this.toModelInfo(model));

    const fetchedAt = Date.now();
    for (const model of converted) {
      this.modelCache.set(model.id, { model, fetchedAt });
    }

    return converted;
  }

  /**
   * Get detailed information about a specific model.
   * Uses cache when available, falls back to listing all models.
   */
  async getModel(modelId: string): Promise<ModelInfo> {
    const cached = this.modelCache.get(modelId);
    if (cached && Date.now() - cached.fetchedAt < MODEL_CACHE_TTL_MS) {
      return cached.model;
    }

    const models = await this.listModels();
    const model = models.find(({ id }) => id === modelId);

    if (!model) {
      throw new Error(`Model "${modelId}" not found in Google Gemini catalog`);
    }

    this.modelCache.set(modelId, { model, fetchedAt: Date.now() });
    return model;
  }

  /**
   * Strip the "models/" prefix from Gemini model names.
   * e.g. "models/gemini-2.5-pro" -> "gemini-2.5-pro"
   */
  private stripModelPrefix(name: string): string {
    return name.startsWith("models/") ? name.slice(7) : name;
  }

  /**
   * Determine the modality string based on the model's supported methods
   * and its name (some vision models aren't explicitly tagged).
   */
  private determineModality(model: GeminiApiModel): string {
    const name = model.name.toLowerCase();
    const methods = model.supportedGenerationMethods;

    // Image generation models
    if (name.includes("image") && methods.includes("generateContent")) {
      return "text+image->text";
    }

    // All Gemini models from 1.5+ support multimodal input (images, video, audio)
    if (
      name.includes("gemini-2") ||
      name.includes("gemini-3") ||
      name.includes("gemini-1.5")
    ) {
      return "text+image->text";
    }

    return "text->text";
  }

  /**
   * Look up hardcoded pricing for a model ID.
   * Tries exact match first, then prefix matching for versioned model names.
   */
  private lookupPricing(modelId: string): {
    prompt: string;
    completion: string;
  } {
    // Exact match
    if (GEMINI_PRICING[modelId]) {
      return GEMINI_PRICING[modelId];
    }

    // Try prefix matching: "gemini-2.5-pro-preview-05-06" matches "gemini-2.5-pro"
    for (const [key, pricing] of Object.entries(GEMINI_PRICING)) {
      if (modelId.startsWith(key)) {
        return pricing;
      }
    }

    return DEFAULT_PRICING;
  }

  /**
   * Convert a raw Gemini API model to our normalized ModelInfo format.
   */
  private toModelInfo(model: GeminiApiModel): ModelInfo {
    const modelId = this.stripModelPrefix(model.name);
    const pricing = this.lookupPricing(modelId);
    const modality = this.determineModality(model);

    return {
      id: modelId,
      name: model.displayName,
      description: model.description || undefined,
      context_length: model.inputTokenLimit ?? 0,
      pricing,
      top_provider: {
        context_length: model.inputTokenLimit,
        max_completion_tokens: model.outputTokenLimit,
        is_moderated: true, // Google models are moderated by default
      },
      architecture: {
        modality,
        tokenizer: "gemini",
      },
      supported_generation_methods: model.supportedGenerationMethods,
    };
  }
}
