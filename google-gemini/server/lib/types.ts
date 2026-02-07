/**
 * Type definitions for Google Gemini API
 */

/**
 * Raw model response from the Gemini REST API
 * @see https://ai.google.dev/api/models
 */
export interface GeminiApiModel {
  name: string; // e.g. "models/gemini-2.5-pro"
  baseModelId?: string;
  version: string;
  displayName: string;
  description: string;
  inputTokenLimit: number;
  outputTokenLimit: number;
  supportedGenerationMethods: string[];
  temperature?: number;
  maxTemperature?: number;
  topP?: number;
  topK?: number;
}

/**
 * Response from the Gemini models.list endpoint
 */
export interface GeminiListModelsResponse {
  models: GeminiApiModel[];
  nextPageToken?: string;
}

/**
 * Normalized model info used internally, matching the shape
 * from the OpenRouter MCP for consistency across LLM bindings.
 */
export interface ModelInfo {
  id: string;
  name: string;
  description?: string;
  context_length: number;
  pricing: {
    prompt: string; // Cost per 1M tokens
    completion: string; // Cost per 1M tokens
  };
  top_provider?: {
    context_length?: number;
    max_completion_tokens?: number;
    is_moderated: boolean;
  };
  per_request_limits?: {
    prompt_tokens?: string;
    completion_tokens?: string;
  };
  architecture?: {
    modality: string; // e.g., "text->text", "text+image->text"
    tokenizer: string;
    instruct_type?: string;
  };
  created?: number;
  supported_generation_methods?: string[];
}

export interface ModelRecommendation {
  modelId: string;
  name: string;
  reasoning: string;
  score: number;
  pricing: {
    promptPrice: string;
    completionPrice: string;
  };
  contextLength: number;
  modality: string;
}

export interface TaskRequirements {
  maxCostPer1MTokens?: number;
  minContextLength?: number;
  requiredModality?: string;
  prioritize?: "cost" | "quality" | "speed";
}
