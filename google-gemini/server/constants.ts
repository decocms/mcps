/**
 * Google Gemini API constants and configuration
 */

export const GEMINI_BASE_URL =
  "https://generativelanguage.googleapis.com/v1beta";
export const GEMINI_MODELS_ENDPOINT = "/models";

/**
 * Hardcoded pricing for Gemini models (per 1M tokens).
 * The Gemini API does not expose pricing information, so we maintain this table.
 * Prices are in USD per 1M tokens.
 *
 * @see https://ai.google.dev/gemini-api/docs/pricing
 */
export const GEMINI_PRICING: Record<
  string,
  { prompt: string; completion: string }
> = {
  // Gemini 3.x
  "gemini-3-pro-preview": { prompt: "2.50", completion: "15.00" },
  "gemini-3-flash-preview": { prompt: "0.15", completion: "0.60" },

  // Gemini 2.5
  "gemini-2.5-pro": { prompt: "1.25", completion: "10.00" },
  "gemini-2.5-pro-preview-05-06": { prompt: "1.25", completion: "10.00" },
  "gemini-2.5-pro-preview-06-05": { prompt: "1.25", completion: "10.00" },
  "gemini-2.5-flash": { prompt: "0.15", completion: "0.60" },
  "gemini-2.5-flash-preview-05-20": { prompt: "0.15", completion: "0.60" },
  "gemini-2.5-flash-lite-preview-06-17": {
    prompt: "0.075",
    completion: "0.30",
  },

  // Gemini 2.0
  "gemini-2.0-flash": { prompt: "0.10", completion: "0.40" },
  "gemini-2.0-flash-lite": { prompt: "0.075", completion: "0.30" },
  "gemini-2.0-flash-exp": { prompt: "0.10", completion: "0.40" },

  // Gemini 1.5
  "gemini-1.5-pro": { prompt: "1.25", completion: "5.00" },
  "gemini-1.5-flash": { prompt: "0.075", completion: "0.30" },
  "gemini-1.5-flash-8b": { prompt: "0.0375", completion: "0.15" },

  // Gemini 1.0
  "gemini-1.0-pro": { prompt: "0.50", completion: "1.50" },
};

/**
 * Default pricing for unknown models (set to zero to indicate unknown)
 */
export const DEFAULT_PRICING = { prompt: "0", completion: "0" };

// Common model categories for recommendations
export const MODEL_CATEGORIES: Record<string, string[]> = {
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
