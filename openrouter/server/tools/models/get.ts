/**
 * Tool: Get Model
 * Get detailed information about a specific OpenRouter model
 * Implements DECO_COLLECTION_MODELS_GET from @decocms/bindings/models
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
import { getBaseUrl } from "./utils.ts";

// Extract the DECO_COLLECTION_MODELS_GET binding to use its input/output schemas
const GET_MODEL_BINDING = MODELS_COLLECTION_BINDING.find(
  (b) => b.name === "DECO_COLLECTION_MODELS_GET",
);
if (!GET_MODEL_BINDING?.inputSchema || !GET_MODEL_BINDING?.outputSchema) {
  throw new Error(
    "DECO_COLLECTION_MODELS_GET binding not found or missing schemas",
  );
}

export const createGetModelTool = (env: Env) =>
  createPrivateTool({
    id: "DECO_COLLECTION_MODELS_GET",
    description:
      "Get detailed information about a specific OpenRouter model including pricing, capabilities, " +
      "context length, provider information, supported features, and streaming endpoint configuration. " +
      "Use this to learn about a model before using it for chat completions. Model IDs follow the format " +
      "'provider/model-name' (e.g., 'openai/gpt-4o', 'anthropic/claude-3.5-sonnet').",
    inputSchema: GET_MODEL_BINDING.inputSchema,
    outputSchema: GET_MODEL_BINDING.outputSchema,
    execute: async ({
      context,
    }: {
      context: z.infer<typeof GET_MODEL_BINDING.inputSchema>;
    }) => {
      const { id } = context;
      const client = new OpenRouterClient({
        apiKey: getOpenRouterApiKey(env),
      });

      try {
        const model = await client.getModel(id);
        const baseUrl = getBaseUrl(env);

        return {
          item: transformToModelEntity(model, baseUrl),
        };
      } catch {
        // Model not found
        return {
          item: null,
        };
      }
    },
  });

type ListedModel = Awaited<ReturnType<OpenRouterClient["listModels"]>>[number];

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

/**
 * All models are provided through OpenRouter
 * Using null since "openrouter" is not in the provider enum
 */
function extractProvider(_modelId: string): null {
  return null;
}

function transformToModelEntity(model: ListedModel, baseUrl: string) {
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
    provider: extractProvider(model.id),
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
      url: `${baseUrl}/api/v1/chat/completions`,
      method: "POST",
      contentType: "application/json",
      stream: true,
    },
  } as z.infer<typeof ModelSchema>;
}
