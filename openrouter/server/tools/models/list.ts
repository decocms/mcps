/**
 * Tool: List Models
 * List all available models from OpenRouter with filtering and sorting
 */

import { createPrivateTool } from "@decocms/runtime/mastra";
import { z } from "zod";
import type { Env } from "../../main.ts";
import { OpenRouterClient } from "../../lib/openrouter-client.ts";
import { filterModels, sortModels } from "./utils.ts";
import { WELL_KNOWN_MODEL_IDS } from "./well-known.ts";

type ListedModel = Awaited<ReturnType<OpenRouterClient["listModels"]>>[number];

export const createListModelsTool = (env: Env) =>
  createPrivateTool({
    id: "MODELS_LIST",
    description:
      "List all available models from OpenRouter with their details, pricing, and capabilities. " +
      "Returns comprehensive information about each model including context length, pricing per 1M tokens, " +
      "modality (text, vision, etc.), and provider information. Supports filtering by price, context length, " +
      "modality, and search terms. Perfect for discovering and comparing available AI models.",
    inputSchema: z.object({
      filter: z
        .object({
          modality: z
            .enum(["text->text", "text+image->text", "text->image"])
            .optional()
            .describe(
              "Filter by model modality: 'text->text' for text-only, 'text+image->text' for vision models, 'text->image' for image generation",
            ),
          maxPromptPrice: z
            .number()
            .positive()
            .optional()
            .describe(
              "Maximum price per 1M prompt tokens in dollars (e.g., 5 for $5)",
            ),
          minContextLength: z
            .number()
            .positive()
            .optional()
            .describe(
              "Minimum context length required in tokens (e.g., 100000 for 100k tokens)",
            ),
          search: z
            .string()
            .optional()
            .describe(
              "Search term to filter models by name, ID, or description (case-insensitive)",
            ),
        })
        .optional()
        .describe("Optional filters to narrow down the model list"),
      sortBy: z
        .enum(["price", "context_length", "name"])
        .default("name")
        .optional()
        .describe(
          "Sort results by: 'price' (cheapest first), 'context_length' (largest first), or 'name' (alphabetical)",
        ),
      limit: z
        .number()
        .positive()
        .default(50)
        .optional()
        .describe("Maximum number of models to return (default: 50)"),
      page: z
        .number()
        .int()
        .min(1)
        .default(1)
        .optional()
        .describe("1-based page number for pagination (default: 1)"),
      wellKnownOnly: z
        .boolean()
        .default(true)
        .optional()
        .describe(
          "When true (default), only returns Deco's curated, well-known models. Set to false to include the full catalog.",
        ),
    }),
    outputSchema: z.object({
      models: z.array(
        z.object({
          id: z
            .string()
            .describe("Unique model identifier (use this for API calls)"),
          model: z.string().describe("Model slug (same as id)"),
          name: z.string().describe("Human-readable model name"),
          logo: z.string().nullable().describe("Logo URL for the model"),
          capabilities: z
            .array(z.string())
            .describe("Capabilities or supported generation methods"),
          contextWindow: z
            .number()
            .nullable()
            .describe("Maximum context window supported by the model"),
          inputCost: z
            .number()
            .nullable()
            .describe("Prompt cost per token in USD"),
          outputCost: z
            .number()
            .nullable()
            .describe("Completion cost per token in USD"),
          outputLimit: z
            .number()
            .nullable()
            .describe("Maximum completion tokens supported, if available"),
          description: z.string().nullable().describe("Model description"),
        }),
      ),
    }),
    execute: async ({
      context,
    }: {
      context: {
        filter?: {
          modality?: string;
          maxPromptPrice?: number;
          minContextLength?: number;
          search?: string;
        };
        sortBy?: "price" | "context_length" | "name";
        limit?: number;
        page?: number;
        wellKnownOnly?: boolean;
      };
    }) => {
      const {
        filter,
        sortBy = "name",
        limit = 50,
        page = 1,
        wellKnownOnly = true,
      } = context;
      const pageSize = limit;
      const offset = (page - 1) * pageSize;
      const state = env.DECO_CHAT_REQUEST_CONTEXT.state;
      const client = new OpenRouterClient({
        apiKey: state.apiKey,
      });

      // Fetch all models
      let models = await client.listModels();
      if (filter) {
        models = filterModels(models, filter);
      }
      models = sortModels(models, sortBy);

      // Reorder so well-known models are prioritized (or exclusive)
      const modelById = new Map(models.map((model) => [model.id, model]));
      const wellKnownModels = WELL_KNOWN_MODEL_IDS.map((id) =>
        modelById.get(id),
      ).filter((model): model is (typeof models)[number] => Boolean(model));

      const wellKnownIds = new Set(wellKnownModels.map((model) => model.id));
      const remainingModels = models.filter(
        (model) => !wellKnownIds.has(model.id),
      );

      const orderedModels = wellKnownOnly
        ? wellKnownModels
        : [...wellKnownModels, ...remainingModels];
      const paginated = orderedModels.slice(offset, offset + pageSize);

      return {
        models: paginated.map((model) => ({
          id: model.id,
          model: model.id,
          name: model.name,
          logo: null,
          capabilities: extractCapabilities(model),
          contextWindow: model.context_length || null,
          inputCost: toNumberOrNull(model.pricing.prompt),
          outputCost: toNumberOrNull(model.pricing.completion),
          outputLimit: extractOutputLimit(model),
          description: model.description ?? null,
        })),
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
