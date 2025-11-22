/**
 * Utility functions for model operations
 */

import { MODEL_CATEGORIES } from "../../constants.ts";
import type {
  ModelInfo,
  ModelRecommendation,
  TaskRequirements,
} from "../../lib/types.ts";
import type { Env } from "../../main.ts";

export interface ModelFilterCriteria {
  modality?: string;
  maxPromptPrice?: number;
  minContextLength?: number;
  search?: string;
}

/**
 * Filter models based on criteria
 */
export function filterModels(
  models: ModelInfo[],
  criteria: ModelFilterCriteria,
): ModelInfo[] {
  return models.filter((model) => {
    // Filter by modality
    if (
      criteria.modality &&
      model.architecture?.modality !== criteria.modality
    ) {
      return false;
    }

    // Filter by max prompt price
    if (criteria.maxPromptPrice !== undefined) {
      const promptPrice = parseFloat(model.pricing.prompt);
      if (promptPrice > criteria.maxPromptPrice) {
        return false;
      }
    }

    // Filter by min context length
    if (
      criteria.minContextLength !== undefined &&
      model.context_length < criteria.minContextLength
    ) {
      return false;
    }

    // Filter by search term
    if (criteria.search) {
      const searchLower = criteria.search.toLowerCase();
      const nameMatch = model.name.toLowerCase().includes(searchLower);
      const idMatch = model.id.toLowerCase().includes(searchLower);
      const descMatch = model.description?.toLowerCase().includes(searchLower);
      if (!nameMatch && !idMatch && !descMatch) {
        return false;
      }
    }

    return true;
  });
}

/**
 * Sort models by various fields
 */
export function sortModels(
  models: ModelInfo[],
  sortBy: "price" | "context_length" | "name",
): ModelInfo[] {
  const sorted = [...models];

  switch (sortBy) {
    case "price":
      sorted.sort((a, b) => {
        const priceA = parseFloat(a.pricing.prompt);
        const priceB = parseFloat(b.pricing.prompt);
        return priceA - priceB;
      });
      break;
    case "context_length":
      sorted.sort((a, b) => b.context_length - a.context_length);
      break;
    case "name":
      sorted.sort((a, b) => a.name.localeCompare(b.name));
      break;
  }

  return sorted;
}

/**
 * Calculate a score for a model based on task requirements
 */
function scoreModelForTask(
  model: ModelInfo,
  taskDescription: string,
  requirements: TaskRequirements,
): number {
  let score = 0;

  // Base score
  score += 50;

  // Match task description against model categories
  const taskLower = taskDescription.toLowerCase();
  for (const [category, keywords] of Object.entries(MODEL_CATEGORIES)) {
    const matches = keywords.some((keyword) => taskLower.includes(keyword));
    if (matches) {
      score += 10;
      // Bonus for models that seem to match the category
      if (model.name.toLowerCase().includes(category.toLowerCase())) {
        score += 5;
      }
    }
  }

  // Cost consideration
  if (requirements.maxCostPer1MTokens !== undefined) {
    const promptPrice = parseFloat(model.pricing.prompt);
    if (promptPrice <= requirements.maxCostPer1MTokens) {
      score += 15;
      // Bonus for being well under budget
      if (promptPrice <= requirements.maxCostPer1MTokens * 0.5) {
        score += 10;
      }
    } else {
      score -= 20; // Penalty for exceeding budget
    }
  }

  // Context length consideration
  if (requirements.minContextLength !== undefined) {
    if (model.context_length >= requirements.minContextLength) {
      score += 10;
      // Bonus for having significantly more context
      if (model.context_length >= requirements.minContextLength * 2) {
        score += 5;
      }
    } else {
      score -= 30; // Major penalty for insufficient context
    }
  }

  // Modality match
  if (
    requirements.requiredModality &&
    model.architecture?.modality === requirements.requiredModality
  ) {
    score += 20;
  }

  // Prioritization adjustments
  const prioritize = requirements.prioritize || "quality";
  const promptPrice = parseFloat(model.pricing.prompt);

  if (prioritize === "cost") {
    // Favor cheaper models
    if (promptPrice < 0.5) score += 20;
    else if (promptPrice < 1.0) score += 10;
    else if (promptPrice > 5.0) score -= 10;
  } else if (prioritize === "quality") {
    // Favor models from major providers
    if (
      model.id.includes("gpt-4") ||
      model.id.includes("claude-3") ||
      model.id.includes("gemini")
    ) {
      score += 20;
    }
  } else if (prioritize === "speed") {
    // Favor smaller, faster models
    if (model.context_length < 32000) score += 10;
    if (promptPrice < 1.0) score += 10;
  }

  return Math.max(0, score);
}

/**
 * Recommend models for a specific task
 */
export function recommendModelsForTask(
  taskDescription: string,
  requirements: TaskRequirements,
  availableModels: ModelInfo[],
): ModelRecommendation[] {
  // Filter models that meet basic requirements
  let candidates = [...availableModels];

  if (requirements.maxCostPer1MTokens !== undefined) {
    candidates = candidates.filter(
      (m) => parseFloat(m.pricing.prompt) <= requirements.maxCostPer1MTokens!,
    );
  }

  if (requirements.minContextLength !== undefined) {
    candidates = candidates.filter(
      (m) => m.context_length >= requirements.minContextLength!,
    );
  }

  if (requirements.requiredModality) {
    candidates = candidates.filter(
      (m) => m.architecture?.modality === requirements.requiredModality,
    );
  }

  // Score each candidate
  const scored = candidates
    .map((model) => ({
      model,
      score: scoreModelForTask(model, taskDescription, requirements),
    }))
    .filter((item) => item.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, 5); // Top 5 recommendations

  // Generate recommendations with reasoning
  return scored.map(({ model, score }) => {
    const reasoning = generateReasoning(model, taskDescription, requirements);
    return {
      modelId: model.id,
      name: model.name,
      reasoning,
      score,
      pricing: {
        promptPrice: model.pricing.prompt,
        completionPrice: model.pricing.completion,
      },
      contextLength: model.context_length,
      modality: model.architecture?.modality || "text->text",
    };
  });
}

/**
 * Generate human-readable reasoning for a recommendation
 */
function generateReasoning(
  model: ModelInfo,
  taskDescription: string,
  requirements: TaskRequirements,
): string {
  const reasons: string[] = [];

  // Check task category matches
  const taskLower = taskDescription.toLowerCase();
  for (const [category, keywords] of Object.entries(MODEL_CATEGORIES)) {
    const matches = keywords.some((keyword) => taskLower.includes(keyword));
    if (matches) {
      reasons.push(`Well-suited for ${category.toLowerCase()} tasks`);
      break;
    }
  }

  // Cost consideration
  const promptPrice = parseFloat(model.pricing.prompt);
  if (requirements.prioritize === "cost" && promptPrice < 1.0) {
    reasons.push(`Excellent value at $${promptPrice}/1M tokens`);
  } else if (promptPrice < 0.5) {
    reasons.push("Very cost-effective");
  }

  // Context length
  if (model.context_length >= 100000) {
    reasons.push("Large context window for complex tasks");
  } else if (
    requirements.minContextLength &&
    model.context_length >= requirements.minContextLength * 2
  ) {
    reasons.push("Ample context length for your needs");
  }

  // Quality/provider
  if (model.id.includes("gpt-4") || model.id.includes("claude-3")) {
    reasons.push("High-quality flagship model");
  } else if (model.id.includes("gemini")) {
    reasons.push("Advanced Google model with strong capabilities");
  }

  // Modality
  if (model.architecture?.modality === "text+image->text") {
    reasons.push("Supports vision/multimodal inputs");
  }

  return reasons.join(". ") || "Good general-purpose model";
}

/**
 * Build a smart fallback chain based on requirements
 */
export function buildFallbackChain(
  primaryModel: string,
  _requirements: TaskRequirements,
  availableModels: ModelInfo[],
): string[] {
  const chain = [primaryModel];

  // Find the primary model info
  const primary = availableModels.find((m) => m.id === primaryModel);
  if (!primary) return chain;

  // Find similar models as fallbacks
  const candidates = availableModels.filter((m) => {
    if (m.id === primaryModel) return false;

    // Same modality
    if (m.architecture?.modality !== primary.architecture?.modality) {
      return false;
    }

    // Similar or lower price
    const mPrice = parseFloat(m.pricing.prompt);
    const pPrice = parseFloat(primary.pricing.prompt);
    if (mPrice > pPrice * 1.5) return false;

    // Similar or better context length
    if (m.context_length < primary.context_length * 0.8) return false;

    return true;
  });

  // Add top 2 fallbacks
  const fallbacks = candidates.slice(0, 2);
  chain.push(...fallbacks.map((m) => m.id));

  return chain;
}

/**
 * Compare multiple models and return structured comparison
 */
export function compareModels(
  modelIds: string[],
  models: ModelInfo[],
  criteria?: string[],
): {
  comparison: Array<{
    modelId: string;
    name: string;
    metrics: Record<string, unknown>;
  }>;
  recommendation?: string;
} {
  const comparison = modelIds.map((id) => {
    const model = models.find((m) => m.id === id);
    if (!model) {
      return {
        modelId: id,
        name: "Not found",
        metrics: { error: "Model not found" },
      };
    }

    const metrics: Record<string, unknown> = {
      promptPrice: model.pricing.prompt,
      completionPrice: model.pricing.completion,
      contextLength: model.context_length,
      modality: model.architecture?.modality || "unknown",
    };

    if (!criteria || criteria.includes("price")) {
      metrics.costPer1MPromptTokens = `$${model.pricing.prompt}`;
      metrics.costPer1MCompletionTokens = `$${model.pricing.completion}`;
    }

    if (!criteria || criteria.includes("context_length")) {
      metrics.contextLength = model.context_length;
      metrics.maxCompletionTokens = model.top_provider?.max_completion_tokens;
    }

    if (!criteria || criteria.includes("modality")) {
      metrics.modality = model.architecture?.modality;
      metrics.tokenizer = model.architecture?.tokenizer;
    }

    if (!criteria || criteria.includes("moderation")) {
      metrics.isModerated = model.top_provider?.is_moderated;
    }

    return {
      modelId: model.id,
      name: model.name,
      metrics,
    };
  });

  // Generate a simple recommendation
  const validModels = comparison.filter((c) => !c.metrics.error);
  if (validModels.length > 0) {
    const cheapest = validModels.reduce((min, curr) => {
      const minPrice = parseFloat(String(min.metrics.promptPrice || "999"));
      const currPrice = parseFloat(String(curr.metrics.promptPrice || "999"));
      return currPrice < minPrice ? curr : min;
    });

    const mostContext = validModels.reduce((max, curr) => {
      const maxCtx = Number(max.metrics.contextLength || 0);
      const currCtx = Number(curr.metrics.contextLength || 0);
      return currCtx > maxCtx ? curr : max;
    });

    let recommendation = "";
    if (cheapest.modelId === mostContext.modelId) {
      recommendation = `${cheapest.name} offers the best balance of cost and context length.`;
    } else {
      recommendation = `${cheapest.name} is most cost-effective. ${mostContext.name} has the largest context window.`;
    }

    return { comparison, recommendation };
  }

  return { comparison };
}

/**
 * Get the base URL for the API endpoint
 * In development, uses localhost; in production, uses the deployed URL
 */
export function getBaseUrl(_env: Env): string {
  // In development, use localhost
  //   return "http://localhost:8787";
  // In production, use the deployed URL
  return "https://openrouter.deco.page";
}
