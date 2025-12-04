/**
 * LLM Binding Implementation for OpenRouter
 *
 * Implements all required tools for the Language Model binding:
 * - COLLECTION_LLM_LIST: Lists all models with filtering/pagination
 * - COLLECTION_LLM_GET: Gets single model by ID
 * - LLM_METADATA: Returns model metadata with supported URL patterns
 * - LLM_DO_STREAM: Streams language model responses
 * - LLM_DO_GENERATE: Generates complete non-streaming responses
 */

import type {
  LanguageModelV2CallOptions,
  LanguageModelV2StreamPart,
} from "@ai-sdk/provider";
import {
  LANGUAGE_MODEL_BINDING,
  type ModelCollectionEntitySchema,
} from "@decocms/bindings/llm";
import { streamToResponse } from "@decocms/runtime/bindings";
import {
  createPrivateTool,
  createStreamableTool,
} from "@decocms/runtime/tools";
import { createOpenRouter } from "@openrouter/ai-sdk-provider";
import type { CONTRACT_SETTLEInput } from "shared/deco.gen.ts";
import type { z } from "zod";
import { getOpenRouterApiKey } from "../lib/env.ts";
import { OpenRouterClient } from "../lib/openrouter-client.ts";
import type { Env } from "../main.ts";
import { getBaseUrl } from "./models/utils.ts";
import { WELL_KNOWN_MODEL_IDS } from "./models/well-known.ts";

// ============================================================================
// Constants
// ============================================================================

/**
 * All models are served through OpenRouter, so the provider is always "openrouter"
 */
const OPENROUTER_PROVIDER = "openrouter" as const;

/**
 * Default logo for providers without a specific logo
 */
const DEFAULT_LOGO =
  "https://assets.decocache.com/decocms/bc2ca488-2bae-4aac-8d3e-ead262dad764/agent.png";

/**
 * Provider logo mapping - maps provider names to their logo URLs
 */
const PROVIDER_LOGOS: Record<string, string> = {
  openai:
    "https://assets.decocache.com/webdraw/15dc381c-23b4-4f6b-9ceb-9690f77a7cf5/openai.svg",
  anthropic:
    "https://assets.decocache.com/webdraw/6ae2b0e1-7b81-48f7-9707-998751698b6f/anthropic.svg",
  google:
    "https://assets.decocache.com/webdraw/17df85af-1578-42ef-ae07-4300de0d1723/gemini.svg",
  "x-ai":
    "https://assets.decocache.com/webdraw/7a8003ff-8f2d-4988-8693-3feb20e87eca/xai.svg",
};

// ============================================================================
// Types
// ============================================================================

type ListedModel = Awaited<ReturnType<OpenRouterClient["listModels"]>>[number];

// Extract binding schemas
const LIST_BINDING = LANGUAGE_MODEL_BINDING.find(
  (b) => b.name === "COLLECTION_LLM_LIST",
);
const GET_BINDING = LANGUAGE_MODEL_BINDING.find(
  (b) => b.name === "COLLECTION_LLM_GET",
);
const METADATA_BINDING = LANGUAGE_MODEL_BINDING.find(
  (b) => b.name === "LLM_METADATA",
);
const STREAM_BINDING = LANGUAGE_MODEL_BINDING.find(
  (b) => b.name === "LLM_DO_STREAM",
);
const GENERATE_BINDING = LANGUAGE_MODEL_BINDING.find(
  (b) => b.name === "LLM_DO_GENERATE",
);

if (!LIST_BINDING?.inputSchema || !LIST_BINDING?.outputSchema) {
  throw new Error("COLLECTION_LLM_LIST binding not found or missing schemas");
}
if (!GET_BINDING?.inputSchema || !GET_BINDING?.outputSchema) {
  throw new Error("COLLECTION_LLM_GET binding not found or missing schemas");
}
if (!METADATA_BINDING?.inputSchema || !METADATA_BINDING?.outputSchema) {
  throw new Error("LLM_METADATA binding not found or missing schemas");
}
if (!STREAM_BINDING?.inputSchema) {
  throw new Error("LLM_DO_STREAM binding not found or missing schemas");
}
if (!GENERATE_BINDING?.inputSchema || !GENERATE_BINDING?.outputSchema) {
  throw new Error("LLM_DO_GENERATE binding not found or missing schemas");
}

// ============================================================================
// Helper Functions
// ============================================================================

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
  const capabilities: string[] = [];

  // Add text capability by default
  capabilities.push("text");

  // Check for vision capability
  if (model.architecture?.modality?.includes("image")) {
    capabilities.push("vision");
  }

  // Check for tools/function calling support
  if (model.supported_generation_methods?.includes("tools")) {
    capabilities.push("tools");
  }

  // Check for JSON mode support
  if (model.supported_generation_methods?.includes("json_mode")) {
    capabilities.push("json-mode");
  }

  return capabilities;
}

function extractProviderLogo(modelId: string): string {
  // Extract provider from model id (e.g., "anthropic/claude-3.5-sonnet" → "anthropic")
  const provider = modelId.split("/")[0] || "";
  return PROVIDER_LOGOS[provider] ?? DEFAULT_LOGO;
}

function transformToLLMEntity(
  model: ListedModel,
  _baseUrl: string,
): z.infer<typeof ModelCollectionEntitySchema> {
  const now = new Date().toISOString();
  const inputCost = toNumberOrNull(model.pricing.prompt);
  const outputCost = toNumberOrNull(model.pricing.completion);
  const contextWindow = model.context_length || 0;
  const maxOutputTokens = extractOutputLimit(model) || 0;
  const logo = extractProviderLogo(model.id);

  return {
    id: model.id,
    title: model.name,
    created_at: model.created
      ? new Date(model.created * 1000).toISOString()
      : now,
    updated_at: now,
    created_by: undefined,
    updated_by: undefined,
    logo,
    description: model.description ?? null,
    capabilities: extractCapabilities(model),
    provider: OPENROUTER_PROVIDER,
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
  };
}

function applyWhereFilter(
  models: ListedModel[],
  where: Record<string, unknown>,
): ListedModel[] {
  const whereAny = where as {
    operator?: string;
    conditions?: Record<string, unknown>[];
    field?: string[];
    value?: unknown;
  };

  if (whereAny.operator === "and" && whereAny.conditions) {
    let filtered = models;
    for (const condition of whereAny.conditions) {
      filtered = applyWhereFilter(filtered, condition);
    }
    return filtered;
  }

  if (whereAny.operator === "or" && whereAny.conditions) {
    const results = new Set<ListedModel>();
    for (const condition of whereAny.conditions) {
      applyWhereFilter(models, condition).forEach((m) => {
        results.add(m);
      });
    }
    return Array.from(results);
  }

  if (whereAny.field && whereAny.operator && whereAny.value !== undefined) {
    const field = whereAny.field[0];
    return models.filter((model) => {
      if (field === "id" || field === "title") {
        const modelValue = field === "id" ? model.id : model.name;
        if (whereAny.operator === "eq") {
          return modelValue === whereAny.value;
        }
        if (whereAny.operator === "like" || whereAny.operator === "contains") {
          return String(modelValue)
            .toLowerCase()
            .includes(String(whereAny.value).toLowerCase());
        }
        if (whereAny.operator === "in" && Array.isArray(whereAny.value)) {
          return whereAny.value.includes(modelValue);
        }
      }
      if (field === "provider") {
        // All models are from OpenRouter
        if (whereAny.operator === "eq") {
          return OPENROUTER_PROVIDER === whereAny.value;
        }
        if (whereAny.operator === "in" && Array.isArray(whereAny.value)) {
          return whereAny.value.includes(OPENROUTER_PROVIDER);
        }
      }
      return true;
    });
  }

  return models;
}

function applyOrderBy(
  models: ListedModel[],
  orderBy: Array<{ field: string[]; direction?: string }>,
): ListedModel[] {
  const sorted = [...models];
  for (const order of orderBy.reverse()) {
    const field = order.field[0];
    const direction = order.direction === "desc" ? -1 : 1;

    sorted.sort((a, b) => {
      let aVal: string;
      let bVal: string;

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

function calculateChatCost(
  promptTokens: number,
  completionTokens: number,
  pricing: { prompt: string; completion: string },
): { prompt: number; completion: number; total: number } {
  const promptPrice = parseFloat(pricing.prompt) || 0;
  const completionPrice = parseFloat(pricing.completion) || 0;

  // Prices are per 1M tokens, but promptPrice is already on the right unit scale
  const promptCost = promptTokens * promptPrice;
  const completionCost = completionTokens * completionPrice;

  return {
    prompt: promptCost,
    completion: completionCost,
    total: promptCost + completionCost,
  };
}

// ============================================================================
// Tool Implementations
// ============================================================================

/**
 * COLLECTION_LLM_LIST - Lists all available models with filtering and pagination
 */
export const createListLLMTool = (env: Env) =>
  createPrivateTool({
    id: "COLLECTION_LLM_LIST",
    description:
      "List all available models from OpenRouter with filtering and pagination support. " +
      "Returns comprehensive information about each model including capabilities, pricing, and limits.",
    inputSchema: LIST_BINDING.inputSchema,
    outputSchema: LIST_BINDING.outputSchema,
    execute: async ({
      context,
    }: {
      context: z.infer<typeof LIST_BINDING.inputSchema>;
    }) => {
      const { where, orderBy, limit = 50, offset = 0 } = context;
      const client = new OpenRouterClient({
        apiKey: getOpenRouterApiKey(env),
      });

      // Fetch all models
      let models = await client.listModels();

      // Apply filters from where expression
      if (where) {
        models = applyWhereFilter(models, where as Record<string, unknown>);
      }

      // Apply sorting from orderBy
      if (orderBy && orderBy.length > 0) {
        models = applyOrderBy(
          models,
          orderBy as Array<{ field: string[]; direction?: string }>,
        );
      } else {
        // Default sorting: prioritize well-known models
        models = sortModelsByWellKnown(models);
      }

      // Apply pagination
      const totalCount = models.length;
      const paginated = models.slice(offset, offset + limit);
      const hasMore = models.length > offset + limit;

      // Get base URL for endpoints
      const baseUrl = getBaseUrl(env);

      return {
        items: paginated.map((model) => transformToLLMEntity(model, baseUrl)),
        totalCount,
        hasMore,
      };
    },
  });

/**
 * COLLECTION_LLM_GET - Retrieves a single model by its ID
 */
export const createGetLLMTool = (env: Env) =>
  createPrivateTool({
    id: "COLLECTION_LLM_GET",
    description:
      "Get detailed information about a specific OpenRouter model including " +
      "pricing, capabilities, context length, and provider information.",
    inputSchema: GET_BINDING.inputSchema,
    outputSchema: GET_BINDING.outputSchema,
    execute: async ({
      context,
    }: {
      context: z.infer<typeof GET_BINDING.inputSchema>;
    }) => {
      const { id } = context;
      const client = new OpenRouterClient({
        apiKey: getOpenRouterApiKey(env),
      });

      try {
        const model = await client.getModel(id);
        const baseUrl = getBaseUrl(env);

        return {
          item: transformToLLMEntity(model, baseUrl),
        };
      } catch {
        // Model not found - return null as per spec
        return {
          item: null,
        };
      }
    },
  });

/**
 * LLM_METADATA - Returns metadata about a specific model's capabilities
 */
export const createLLMMetadataTool = (env: Env) =>
  createPrivateTool({
    id: "LLM_METADATA",
    description:
      "Get metadata about a specific model's capabilities including supported URL patterns " +
      "for different media types (images, files, etc.).",
    inputSchema: METADATA_BINDING.inputSchema,
    outputSchema: METADATA_BINDING.outputSchema,
    execute: async ({
      context,
    }: {
      context: z.infer<typeof METADATA_BINDING.inputSchema>;
    }) => {
      const { modelId } = context;
      const client = new OpenRouterClient({
        apiKey: getOpenRouterApiKey(env),
      });

      try {
        const model = await client.getModel(modelId);

        // Determine supported URLs based on model modality
        const supportedUrls: Record<string, string[]> = {};

        // All models support text
        supportedUrls["text/*"] = ["data:*"];

        // Check if model supports vision/images
        if (model.architecture?.modality?.includes("image")) {
          supportedUrls["image/*"] = ["https://*", "data:*"];
        }

        return {
          supportedUrls,
        };
      } catch {
        // Return basic metadata if model not found
        return {
          supportedUrls: {
            "text/*": ["data:*"],
          },
        };
      }
    },
  });

type FinishType<T extends LanguageModelV2StreamPart> = T extends {
  type: "finish";
}
  ? T
  : never;

const getUsageFromStream = (
  input: ReadableStream<LanguageModelV2StreamPart>,
): [
  Promise<FinishType<LanguageModelV2StreamPart>>,
  ReadableStream<LanguageModelV2StreamPart>,
] => {
  const usage = Promise.withResolvers<FinishType<LanguageModelV2StreamPart>>();

  return [
    usage.promise,
    input.pipeThrough(
      new TransformStream<LanguageModelV2StreamPart, LanguageModelV2StreamPart>(
        {
          transform(chunk, controller) {
            if (chunk.type === "finish") {
              usage.resolve(chunk);
            }
            controller.enqueue(chunk);
          },
          cancel(reason) {
            usage.reject(reason);
          },
        },
      ),
    ),
  ];
};

/**
 * LLM_DO_STREAM - Streams a language model response in real-time
 */
export const createLLMStreamTool = (env: Env) =>
  createStreamableTool({
    id: "LLM_DO_STREAM",
    description:
      "Stream a language model response in real-time using OpenRouter. " +
      "Returns a streaming response for interactive chat experiences.",
    inputSchema: STREAM_BINDING.inputSchema,
    execute: async ({ context, runtimeContext }) => {
      const {
        modelId,
        callOptions: { abortSignal: _abortSignal, ...callOptions },
      } = context;
      env.MESH_REQUEST_CONTEXT.ensureAuthenticated();

      const apiKey = getOpenRouterApiKey(env);
      const client = new OpenRouterClient({ apiKey });
      const modelInfo = await client.getModel(modelId);

      // Calculate max cost for authorization
      const maxContextLength = Math.min(
        JSON.stringify(callOptions.prompt).length,
        modelInfo.context_length,
      );
      const maxCompletionTokens =
        callOptions.maxOutputTokens ??
        modelInfo.top_provider?.max_completion_tokens ??
        1000000;
      const costPerCompletionToken = parseFloat(modelInfo.pricing.completion);
      const costPerPromptToken = parseFloat(modelInfo.pricing.prompt);
      const amountUsd =
        maxContextLength * costPerPromptToken +
        maxCompletionTokens * costPerCompletionToken;
      const amountMicroDollars = amountUsd * 1000000;

      let settle: (
        input: Omit<CONTRACT_SETTLEInput, "transactionId">,
      ) => Promise<void> = (_: Omit<CONTRACT_SETTLEInput, "transactionId">) => {
        return Promise.resolve();
      };

      if (env.OPENROUTER_CONTRACT) {
        const { transactionId } =
          await env.OPENROUTER_CONTRACT.CONTRACT_AUTHORIZE({
            clauses: [
              {
                clauseId: "micro-dollar",
                amount: amountMicroDollars,
              },
            ],
          });
        settle = async (input: Omit<CONTRACT_SETTLEInput, "transactionId">) => {
          await env.OPENROUTER_CONTRACT.CONTRACT_SETTLE({
            transactionId,
            ...input,
          });
        };
      }

      // Create OpenRouter provider
      const openrouter = createOpenRouter({ apiKey });
      const model = openrouter.languageModel(modelId);

      const callResponse = await model.doStream(
        callOptions as LanguageModelV2CallOptions,
      );
      const [usage, stream] = getUsageFromStream(callResponse.stream);
      const response = streamToResponse(stream);

      // Settle contract after stream completes
      const { waitUntil } =
        "waitUntil" in runtimeContext
          ? (runtimeContext as { waitUntil?: (p: Promise<unknown>) => void })
          : {
              waitUntil: async (p: Promise<unknown>) => {
                await p;
              },
            };

      waitUntil?.(
        usage
          .then(async ({ usage }) => {
            try {
              const estimatedCost = calculateChatCost(
                usage.inputTokens ?? 0,
                usage.outputTokens ?? 0,
                modelInfo.pricing,
              );
              const costMicroDollars = estimatedCost.total * 1_000_000;
              await settle({
                vendorId: env.WALLET_VENDOR_ID,
                clauses: [
                  {
                    clauseId: "micro-dollar",
                    amount: costMicroDollars,
                  },
                ],
              });
            } catch (error) {
              console.warn("Could not settle contract:", error);
            }
          })
          .catch((error) => {
            console.warn("Could not settle contract:", error);
          }),
      );

      // Return the data stream response
      return response;
    },
  });

/**
 * LLM_DO_GENERATE - Generates a complete response in a single call (non-streaming)
 */
export const createLLMGenerateTool = (env: Env) =>
  createPrivateTool({
    id: "LLM_DO_GENERATE",
    description:
      "Generate a complete language model response using OpenRouter (non-streaming). " +
      "Returns the full response with usage statistics and cost information.",
    inputSchema: GENERATE_BINDING.inputSchema,
    outputSchema: GENERATE_BINDING.outputSchema,
    execute: async ({ context }) => {
      const {
        modelId,
        callOptions: { abortSignal: _abortSignal, ...callOptions },
      } = context;
      env.MESH_REQUEST_CONTEXT.ensureAuthenticated();

      const apiKey = getOpenRouterApiKey(env);
      const client = new OpenRouterClient({ apiKey });
      const modelInfo = await client.getModel(modelId);

      // Calculate max cost for authorization (same pattern as stream)
      const maxContextLength = Math.min(
        JSON.stringify(callOptions.prompt).length,
        modelInfo.context_length,
      );
      const maxCompletionTokens =
        callOptions.maxOutputTokens ??
        modelInfo.top_provider?.max_completion_tokens ??
        1000000;
      const costPerCompletionToken = parseFloat(modelInfo.pricing.completion);
      const costPerPromptToken = parseFloat(modelInfo.pricing.prompt);
      const amountUsd =
        maxContextLength * costPerPromptToken +
        maxCompletionTokens * costPerCompletionToken;
      const amountMicroDollars = amountUsd * 1000000;

      let settle: (
        input: Omit<CONTRACT_SETTLEInput, "transactionId">,
      ) => Promise<void> = (_: Omit<CONTRACT_SETTLEInput, "transactionId">) => {
        return Promise.resolve();
      };

      if (env.OPENROUTER_CONTRACT) {
        // Pre-authorize contract before making the API call

        const { transactionId } =
          await env.OPENROUTER_CONTRACT.CONTRACT_AUTHORIZE({
            clauses: [
              {
                clauseId: "micro-dollar",
                amount: amountMicroDollars,
              },
            ],
          });
        settle = async (input: Omit<CONTRACT_SETTLEInput, "transactionId">) => {
          await env.OPENROUTER_CONTRACT.CONTRACT_SETTLE({
            transactionId,
            ...input,
          });
        };
      }

      // Create OpenRouter provider
      const openrouter = createOpenRouter({ apiKey });
      const model = openrouter.languageModel(modelId);

      // Use doGenerate directly (consistent with doStream pattern)
      const result = await model.doGenerate(
        callOptions as LanguageModelV2CallOptions,
      );

      // Settle contract with actual usage

      try {
        const estimatedCost = calculateChatCost(
          result.usage?.inputTokens ?? 0,
          result.usage?.outputTokens ?? 0,
          modelInfo.pricing,
        );
        const costMicroDollars = estimatedCost.total * 1_000_000;
        await settle({
          vendorId: env.WALLET_VENDOR_ID,
          clauses: [
            {
              clauseId: "micro-dollar",
              amount: costMicroDollars,
            },
          ],
        });
      } catch (error) {
        console.warn("Could not settle contract:", error);
      }

      return result as unknown as z.infer<typeof GENERATE_BINDING.outputSchema>;
    },
  });

/**
 * Creates all LLM binding tools for OpenRouter.
 * Returns an array of tools that implement the Language Model binding.
 */
export const createLLMBinding = (env: Env) => [
  createListLLMTool(env),
  createGetLLMTool(env),
  createLLMMetadataTool(env),
  createLLMStreamTool(env),
  createLLMGenerateTool(env),
];
