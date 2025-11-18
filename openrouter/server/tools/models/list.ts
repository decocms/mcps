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

export const createListModelsTool = (env: Env) =>
  createPrivateTool({
    id: "LIST_MODELS",
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
        .default(false)
        .optional()
        .describe(
          "When true, only returns Deco's curated, well-known models (ignores other filters except sort)",
        ),
    }),
    outputSchema: z.object({
      models: z.array(
        z.object({
          id: z
            .string()
            .describe("Unique model identifier (use this for API calls)"),
          name: z.string().describe("Human-readable model name"),
          description: z.string().optional().describe("Model description"),
          contextLength: z
            .number()
            .describe("Maximum context length in tokens"),
          promptPrice: z
            .string()
            .describe("Cost per 1M prompt tokens in dollars (e.g., '0.50')"),
          completionPrice: z
            .string()
            .describe("Cost per 1M completion tokens in dollars"),
          modality: z
            .string()
            .describe(
              "Model capability (e.g., 'text->text', 'text+image->text')",
            ),
          topProvider: z
            .string()
            .optional()
            .describe("Recommended provider for this model"),
          isModerated: z
            .boolean()
            .optional()
            .describe("Whether content is moderated"),
        }),
      ),
      total: z.number().describe("Total number of models matching filters"),
      hasMore: z
        .boolean()
        .describe("Whether there are more results beyond the current page"),
      page: z.number().describe("Current page number"),
      pageSize: z.number().describe("Number of models per page"),
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
        wellKnownOnly = false,
      } = context;
      const pageSize = limit;
      const offset = (page - 1) * pageSize;
      const state = env.DECO_CHAT_REQUEST_CONTEXT.state;
      const client = new OpenRouterClient({
        apiKey: state.apiKey,
        siteName: state.siteName,
        siteUrl: state.siteUrl,
      });

      // Fetch all models
      let models = await client.listModels();

      // Apply filters if provided
      if (filter) {
        models = filterModels(models, filter);
      }

      // Sort models
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

      const total = orderedModels.length;
      const paginated = orderedModels.slice(offset, offset + pageSize);
      const hasMore = offset + pageSize < total;

      return {
        models: paginated.map((model) => ({
          id: model.id,
          name: model.name,
          description: model.description,
          contextLength: model.context_length,
          promptPrice: model.pricing.prompt,
          completionPrice: model.pricing.completion,
          modality: model.architecture?.modality || "text->text",
          topProvider: model.top_provider ? "available" : undefined,
          isModerated: model.top_provider?.is_moderated,
        })),
        total,
        hasMore,
        page,
        pageSize,
      };
    },
  });
