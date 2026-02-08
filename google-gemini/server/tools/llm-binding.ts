/**
 * LLM Binding Implementation for Google Gemini
 *
 * Implements all required tools for the Language Model binding:
 * - COLLECTION_LLM_LIST: Lists all models with filtering/pagination
 * - COLLECTION_LLM_GET: Gets single model by ID
 * - LLM_METADATA: Returns model metadata with supported URL patterns
 * - LLM_DO_STREAM: Streams language model responses
 * - LLM_DO_GENERATE: Generates complete non-streaming responses
 */

import type { APICallError, LanguageModelV2StreamPart } from "@ai-sdk/provider";
import {
  LANGUAGE_MODEL_BINDING,
  type ModelCollectionEntitySchema,
} from "@decocms/bindings/llm";
import { streamToResponse } from "@decocms/runtime/bindings";
import {
  createPrivateTool,
  createStreamableTool,
} from "@decocms/runtime/tools";
import { createGoogleGenerativeAI } from "@ai-sdk/google";
import { getGeminiApiKey } from "server/lib/env.ts";
import type { z } from "zod";
import { GeminiClient } from "../lib/gemini-client.ts";
import type { ModelInfo } from "../lib/types.ts";
import type { Env } from "../main.ts";
import type { UsageHooks } from "./hooks.ts";
import { WELL_KNOWN_MODEL_IDS } from "./models/well-known.ts";

// ============================================================================
// Constants
// ============================================================================

const GOOGLE_GEMINI_PROVIDER = "google" as const;

const GOOGLE_LOGO =
  "https://assets.decocache.com/webdraw/17df85af-1578-42ef-ae07-4300de0d1723/gemini.svg";

// ============================================================================
// Types
// ============================================================================

type ListedModel = ModelInfo;

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

  // Gemini models support function calling (tools) via generateContent
  if (model.supported_generation_methods?.includes("generateContent")) {
    capabilities.push("tools");
  }

  return capabilities;
}

function transformToLLMEntity(
  model: ListedModel,
): z.infer<typeof ModelCollectionEntitySchema> {
  const now = new Date().toISOString();
  const inputCost = toNumberOrNull(model.pricing.prompt);
  const outputCost = toNumberOrNull(model.pricing.completion);
  const contextWindow = model.context_length || 0;
  const maxOutputTokens = extractOutputLimit(model) || 0;

  return {
    id: model.id,
    title: model.name,
    created_at: now,
    updated_at: now,
    created_by: undefined,
    updated_by: undefined,
    logo: GOOGLE_LOGO,
    description: model.description ?? null,
    capabilities: extractCapabilities(model),
    provider: "google",
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
        if (whereAny.operator === "eq") {
          return GOOGLE_GEMINI_PROVIDER === whereAny.value;
        }
        if (whereAny.operator === "in" && Array.isArray(whereAny.value)) {
          return whereAny.value.includes(GOOGLE_GEMINI_PROVIDER);
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
      "List all available models from Google Gemini with filtering and pagination support. " +
      "Returns comprehensive information about each model including capabilities, pricing, and limits.",
    inputSchema: LIST_BINDING.inputSchema,
    outputSchema: LIST_BINDING.outputSchema,
    execute: async ({ context }) => {
      const { where, orderBy, limit = 50, offset = 0 } = context;
      const client = new GeminiClient({
        apiKey: getGeminiApiKey(env),
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

      return {
        items: paginated.map((model) => transformToLLMEntity(model)),
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
      "Get detailed information about a specific Google Gemini model including " +
      "pricing, capabilities, context length, and provider information.",
    inputSchema: GET_BINDING.inputSchema,
    outputSchema: GET_BINDING.outputSchema,
    execute: async ({ context }) => {
      const { id } = context;
      const client = new GeminiClient({
        apiKey: getGeminiApiKey(env),
      });

      try {
        const model = await client.getModel(id);

        return {
          item: transformToLLMEntity(model),
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
    execute: async ({ context }) => {
      const { modelId } = context;
      const client = new GeminiClient({
        apiKey: getGeminiApiKey(env),
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

const isAPICallError = (error: unknown): error is APICallError =>
  typeof error === "object" &&
  error !== null &&
  Symbol.for("vercel.ai.error") in error &&
  Symbol.for("vercel.ai.error.AI_APICallError") in error;

/**
 * LLM_DO_STREAM - Streams a language model response in real-time
 */
export const createLLMStreamTool = (usageHooks?: UsageHooks) => (env: Env) =>
  createStreamableTool({
    id: "LLM_DO_STREAM",
    description:
      "Stream a language model response in real-time using Google Gemini. " +
      "Returns a streaming response for interactive chat experiences.",
    inputSchema: STREAM_BINDING.inputSchema,
    execute: async ({ context }) => {
      const {
        modelId,
        callOptions: { abortSignal: _abortSignal, ...callOptions },
      } = context;
      env.MESH_REQUEST_CONTEXT.ensureAuthenticated();

      const requestId = crypto.randomUUID();
      let state = "init";
      let finished = false;

      const slowRequestTimeout = setTimeout(() => {
        if (!finished) {
          console.warn(
            `[LLM_DO_STREAM] SLOW REQUEST ${requestId} state=${state} (>20s)`,
          );
        }
      }, 20_000);

      console.log(`[LLM_DO_STREAM] START ${requestId} model=${modelId}`);

      const apiKey = getGeminiApiKey(env);
      // Create Google Gemini provider
      const google = createGoogleGenerativeAI({ apiKey });
      const model = google.languageModel(modelId);

      try {
        state = "preauth";
        const hook = await usageHooks?.start?.(
          await GeminiClient.for(apiKey).getModel(modelId),
          context,
        );

        state = "modelStream";
        const callResponse = await model.doStream(
          callOptions as Parameters<(typeof model)["doStream"]>[0],
        );

        const [usage, stream] = getUsageFromStream(
          callResponse.stream as ReadableStream<LanguageModelV2StreamPart>,
        );
        usage.then((u) => {
          state = "commit";
          hook?.end?.(u).then(() => {
            finished = true;
            clearTimeout(slowRequestTimeout);
            console.log(`[LLM_DO_STREAM] END ${requestId}`);
          });
        });
        const response = streamToResponse(stream);

        // Return the data stream response
        return response;
      } catch (error) {
        finished = true;
        clearTimeout(slowRequestTimeout);
        console.error(
          `[LLM_DO_STREAM] ERROR ${requestId} state=${state}`,
          error,
        );
        if (isAPICallError(error)) {
          return new Response(error.responseBody, {
            status: error.statusCode,
            headers: error.responseHeaders,
          });
        }
        return new Response(String(error ?? "Unknown error"), { status: 500 });
      }
    },
  });

/**
 * Transform AI SDK content part to binding schema format
 */
function transformContentPart(part: unknown): Record<string, unknown> | null {
  if (!part || typeof part !== "object") return null;

  const p = part as Record<string, unknown>;

  switch (p.type) {
    case "text":
      return {
        type: "text",
        text: String(p.text ?? ""),
      };

    case "file":
      return {
        type: "file",
        data: String(p.data ?? p.url ?? ""),
        mediaType: String(
          p.mediaType ?? p.mimeType ?? "application/octet-stream",
        ),
        ...(p.filename ? { filename: String(p.filename) } : {}),
      };

    case "reasoning":
      return {
        type: "reasoning",
        text: String(p.text ?? ""),
      };

    case "tool-call":
      return {
        type: "tool-call",
        toolCallId: String(p.toolCallId ?? ""),
        toolName: String(p.toolName ?? ""),
        input:
          typeof p.input === "string"
            ? p.input
            : JSON.stringify(p.args ?? p.input ?? {}),
      };

    case "tool-result":
      return {
        type: "tool-result",
        toolCallId: String(p.toolCallId ?? ""),
        toolName: String(p.toolName ?? ""),
        output: p.output ?? { type: "text", value: "" },
        result: p.result ?? null,
      };

    default:
      // For any unrecognized type, try to convert to text if possible
      if (typeof p.text === "string") {
        return {
          type: "text",
          text: p.text,
        };
      }
      return null;
  }
}

/**
 * Transform AI SDK generate result to binding schema format
 */
function transformGenerateResult(result: unknown): Record<string, unknown> {
  const r = result as Record<string, unknown>;

  // Transform content array
  const rawContent = Array.isArray(r.content) ? r.content : [];
  const content = rawContent
    .map(transformContentPart)
    .filter((p): p is NonNullable<typeof p> => p !== null);

  // Handle legacy 'text' property - some providers return text at top level
  if (content.length === 0 && typeof r.text === "string" && r.text) {
    content.push({ type: "text", text: r.text });
  }

  // Transform response object
  const rawResponse = (r.response ?? {}) as Record<string, unknown>;
  const response = {
    ...(rawResponse.id ? { id: String(rawResponse.id) } : {}),
    ...(rawResponse.timestamp
      ? { timestamp: String(rawResponse.timestamp) }
      : {}),
    ...(rawResponse.modelId ? { modelId: String(rawResponse.modelId) } : {}),
    ...(rawResponse.headers && typeof rawResponse.headers === "object"
      ? { headers: rawResponse.headers as Record<string, string> }
      : {}),
    ...(rawResponse.body !== undefined ? { body: rawResponse.body } : {}),
  };

  return {
    content,
    finishReason: (r.finishReason as string) ?? "unknown",
    usage: (r.usage as Record<string, number>) ?? {},
    warnings: Array.isArray(r.warnings) ? r.warnings : [],
    ...(r.providerMetadata !== undefined
      ? { providerMetadata: r.providerMetadata }
      : {}),
    ...(r.request !== undefined ? { request: r.request } : {}),
    ...(Object.keys(response).length > 0 ? { response } : {}),
  };
}

/**
 * LLM_DO_GENERATE - Generates a complete response in a single call (non-streaming)
 */
export const createLLMGenerateTool = (usageHooks?: UsageHooks) => (env: Env) =>
  createPrivateTool({
    id: "LLM_DO_GENERATE",
    description:
      "Generate a complete language model response using Google Gemini (non-streaming). " +
      "Returns the full response with usage statistics.",
    inputSchema: GENERATE_BINDING.inputSchema,
    outputSchema: GENERATE_BINDING.outputSchema,
    execute: async ({ context }) => {
      const {
        modelId,
        callOptions: { abortSignal: _abortSignal, ...callOptions },
      } = context;
      env.MESH_REQUEST_CONTEXT.ensureAuthenticated();

      const apiKey = getGeminiApiKey(env);

      // Create Google Gemini provider
      const google = createGoogleGenerativeAI({ apiKey });
      const model = google.languageModel(modelId);

      const hook = await usageHooks?.start?.(
        await GeminiClient.for(apiKey).getModel(modelId),
        context,
      );
      // Use doGenerate directly (consistent with doStream pattern)
      const result = await model.doGenerate(
        callOptions as Parameters<(typeof model)["doGenerate"]>[0],
      );
      await hook?.end?.(result);

      // Transform the result to match the binding schema
      return transformGenerateResult(result) as z.infer<
        typeof GENERATE_BINDING.outputSchema
      >;
    },
  });
