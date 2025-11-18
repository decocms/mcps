/**
 * OpenRouter API constants and configuration
 */

export const OPENROUTER_BASE_URL = "https://openrouter.ai/api/v1";
export const OPENROUTER_MODELS_ENDPOINT = "/models";
export const OPENROUTER_CHAT_ENDPOINT = "/chat/completions";
export const OPENROUTER_GENERATION_ENDPOINT = "/generation";

// Default generation parameters
export const DEFAULT_TEMPERATURE = 1;
export const DEFAULT_MAX_TOKENS = 1000;
export const DEFAULT_TOP_P = 1;

// Special model IDs
export const AUTO_ROUTER_MODEL = "openrouter/auto";

// Common model categories for recommendations
export const MODEL_CATEGORIES = {
  CODE: ["code", "programming", "development", "coding"],
  CREATIVE: ["creative", "writing", "story", "content"],
  ANALYSIS: ["analysis", "data", "research", "analytical"],
  CHAT: ["chat", "conversation", "assistant", "dialogue"],
  MULTIMODAL: ["vision", "image", "multimodal", "visual"],
};

// Modality types
export const MODALITY_TYPES = {
  TEXT_TO_TEXT: "text->text",
  TEXT_IMAGE_TO_TEXT: "text+image->text",
  TEXT_TO_IMAGE: "text->image",
} as const;

// Provider sort options
export const PROVIDER_SORT_OPTIONS = [
  "price",
  "throughput",
  "latency",
] as const;
