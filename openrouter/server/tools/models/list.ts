/**
 * Tool: List Models
 * List all available models from OpenRouter with filtering and sorting
 * Implements DECO_COLLECTION_MODELS_LIST from @decocms/bindings/models
 */

import {
  MODELS_COLLECTION_BINDING,
  ModelSchema,
} from "@decocms/bindings/models";
import { createPrivateTool } from "@decocms/runtime/mastra";
import { z } from "zod";
import { getOpenRouterApiKey } from "../../lib/env.ts";
import { OpenRouterClient } from "../../lib/openrouter-client.ts";
import type { Env } from "../../main.ts";
import { WELL_KNOWN_MODEL_IDS } from "./well-known.ts";
import { getBaseUrl } from "./utils.ts";

type ListedModel = Awaited<ReturnType<OpenRouterClient["listModels"]>>[number];

// Extract the DECO_COLLECTION_MODELS_LIST binding to use its input/output schemas
const LIST_MODELS_BINDING = MODELS_COLLECTION_BINDING.find(
  (b) => b.name === "DECO_COLLECTION_MODELS_LIST",
);
if (!LIST_MODELS_BINDING?.inputSchema || !LIST_MODELS_BINDING?.outputSchema) {
  throw new Error(
    "DECO_COLLECTION_MODELS_LIST binding not found or missing schemas",
  );
}

export const createListModelsTool = (env: Env) =>
  createPrivateTool({
    id: "DECO_COLLECTION_MODELS_LIST",
    description:
      "List all available models from OpenRouter with their details, pricing, capabilities, and streaming endpoints. " +
      "Returns comprehensive information about each model including context length, pricing per 1M tokens, " +
      "modality (text, vision, etc.), provider information, and streaming endpoint configuration. " +
      "Supports filtering and sorting compatible with TanStack DB query patterns.",
    inputSchema: LIST_MODELS_BINDING.inputSchema,
    outputSchema: LIST_MODELS_BINDING.outputSchema,
    execute: async ({
      context,
    }: {
      context: z.infer<typeof LIST_MODELS_BINDING.inputSchema>;
    }) => {
      const { where, orderBy, limit = 50, offset = 0 } = context;
      const client = new OpenRouterClient({
        apiKey: getOpenRouterApiKey(env),
      });

      // Fetch all models
      let models = await client.listModels();

      // Apply filters from where expression
      if (where) {
        models = applyWhereFilter(models, where);
      }

      // Apply sorting from orderBy
      if (orderBy && orderBy.length > 0) {
        models = applyOrderBy(models, orderBy);
      } else {
        // Default sorting: prioritize well-known models
        models = sortModelsByWellKnown(models);
      }

      // Apply pagination
      const paginated = models.slice(offset, offset + limit);
      const hasMore = models.length > offset + limit;

      // Get base URL for endpoints (use a default, can be overridden by env)
      const baseUrl = getBaseUrl(env);

      return {
        items: paginated.map((model) => transformToModelEntity(model, baseUrl)),
        hasMore,
      };
    },
  });

function toNumberOrNull(value?: string): number | null {
  if (!value?.length) return null;

  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function extractOutputLimit(model: ListedModel): number | null {
  const topProviderLimit = model.top_provider?.max_completion_tokens;
  if (typeof topProviderLimit === "number") {
    return topProviderLimit;
  }

  const perRequestLimit = model.per_request_limits?.completion_tokens;
  if (perRequestLimit) {
    const parsed = Number(perRequestLimit);
    return Number.isFinite(parsed) ? parsed : null;
  }

  return null;
}

function extractCapabilities(model: ListedModel): string[] {
  if (model.supported_generation_methods?.length) {
    return model.supported_generation_methods;
  }

  if (model.architecture?.modality) {
    return [model.architecture.modality];
  }

  return [];
}

function transformToModelEntity(
  model: ListedModel,
  baseUrl: string,
): z.infer<typeof ModelSchema> {
  const now = new Date().toISOString();
  const inputCost = toNumberOrNull(model.pricing.prompt);
  const outputCost = toNumberOrNull(model.pricing.completion);
  const contextWindow = model.context_length || 0;
  const maxOutputTokens = extractOutputLimit(model) || 0;

  return {
    id: model.id,
    title: model.name,
    created_at: model.created
      ? new Date(model.created * 1000).toISOString()
      : now,
    updated_at: now,
    created_by: undefined,
    updated_by: undefined,
    logo: null,
    description: model.description ?? null,
    capabilities: extractCapabilities(model),
    provider: "openrouter",
    limits:
      contextWindow > 0 || maxOutputTokens > 0
        ? {
            contextWindow,
            maxOutputTokens,
          }
        : null,
    costs:
      inputCost !== null || outputCost !== null
        ? {
            input: inputCost ?? 0,
            output: outputCost ?? 0,
          }
        : null,
    endpoint: {
      url: `${baseUrl}/api/v1`,
      method: "POST",
      contentType: "application/json",
      stream: true,
    },
  } as z.infer<typeof ModelSchema>;
}

function applyWhereFilter(models: ListedModel[], where: any): ListedModel[] {
  // Simple where filter implementation
  // This is a basic implementation - can be enhanced for complex queries
  if (where.operator === "and" && where.conditions) {
    let filtered = models;
    for (const condition of where.conditions) {
      filtered = applyWhereFilter(filtered, condition);
    }
    return filtered;
  }

  if (where.operator === "or" && where.conditions) {
    const results = new Set<ListedModel>();
    for (const condition of where.conditions) {
      applyWhereFilter(models, condition).forEach((m) => results.add(m));
    }
    return Array.from(results);
  }

  if (where.field && where.operator && where.value !== undefined) {
    const field = where.field[0];
    return models.filter((model) => {
      if (field === "id" || field === "title") {
        const modelValue = field === "id" ? model.id : model.name;
        if (where.operator === "eq") {
          return modelValue === where.value;
        }
        if (where.operator === "like" || where.operator === "contains") {
          return String(modelValue)
            .toLowerCase()
            .includes(String(where.value).toLowerCase());
        }
      }
      return true;
    });
  }

  return models;
}

function applyOrderBy(models: ListedModel[], orderBy: any[]): ListedModel[] {
  const sorted = [...models];
  for (const order of orderBy.reverse()) {
    const field = order.field[0];
    const direction = order.direction === "desc" ? -1 : 1;

    sorted.sort((a, b) => {
      let aVal: any;
      let bVal: any;

      if (field === "id") {
        aVal = a.id;
        bVal = b.id;
      } else if (field === "title") {
        aVal = a.name;
        bVal = b.name;
      } else {
        return 0;
      }

      if (aVal < bVal) return -1 * direction;
      if (aVal > bVal) return 1 * direction;
      return 0;
    });
  }
  return sorted;
}

function sortModelsByWellKnown(models: ListedModel[]): ListedModel[] {
  const modelById = new Map(models.map((model) => [model.id, model]));
  const wellKnownModels = WELL_KNOWN_MODEL_IDS.map((id) =>
    modelById.get(id),
  ).filter((model): model is ListedModel => Boolean(model));

  const wellKnownIds = new Set(wellKnownModels.map((model) => model.id));
  const remainingModels = models.filter((model) => !wellKnownIds.has(model.id));

  return [...wellKnownModels, ...remainingModels];
}
