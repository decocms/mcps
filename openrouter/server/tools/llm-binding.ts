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
import { createOpenRouter } from "@openrouter/ai-sdk-provider";
import { getOpenRouterApiKey } from "server/lib/env.ts";
import type { z } from "zod";
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
  "aion-labs":
    "https://assets.decocache.com/decocms/6da18da8-0160-4b85-8bca-84eefffebe12/images-(6).png",
  ai21: "https://assets.decocache.com/decocms/5d8388e9-027b-4b23-b816-90cee1cd28ad/images-(5).png",
  alfredpros:
    "https://assets.decocache.com/decocms/76eaa620-ce73-43d6-8817-272c1d498b53/images-(19).png",
  alibaba:
    "https://assets.decocache.com/decocms/4d113b13-5412-4d3b-96ec-3c2e7c1f7a5f/images-(8).png",
  allenai:
    "https://assets.decocache.com/decocms/21d6071a-e0da-4919-9f35-902b1d0b85b8/allen.png",
  alpindale:
    "https://assets.decocache.com/decocms/76eaa620-ce73-43d6-8817-272c1d498b53/images-(19).png",
  amazon:
    "https://assets.decocache.com/decocms/31e7b260-6cf0-4753-bb32-bd062b15c5f1/Amazon_icon.png",
  anthropic:
    "https://assets.decocache.com/decocms/4fa4f3ed-1bf3-4e5a-8d05-4f3787df5966/anthropic-icon-tdvkiqisswbrmtkiygb0ia.webp",
  "anthracite-org": DEFAULT_LOGO,
  "arcee-ai":
    "https://assets.decocache.com/decocms/ee325839-6acc-48dc-8cf7-8bab74698015/126496414.png",
  baidu:
    "https://assets.decocache.com/decocms/cf4c19f1-39b5-499e-87b7-e16dc5da2b50/images-(9).png",
  bytedance:
    "https://assets.decocache.com/decocms/1c111a26-8e1d-4a48-9d3c-fe9fb728af06/images-(18).png",
  "bytedance-seed":
    "https://assets.decocache.com/decocms/1c111a26-8e1d-4a48-9d3c-fe9fb728af06/images-(18).png",
  cognitivecomputations: DEFAULT_LOGO,
  cohere:
    "https://assets.decocache.com/decocms/c942091b-b3bf-4c46-af37-fc2c1086d9f7/cohere-color.png",
  deepcogito:
    "https://assets.decocache.com/decocms/4ee77a8f-a36a-4933-8cdf-d2e8676b88d8/images-(13).png",
  deepseek:
    "https://assets.decocache.com/decocms/3611e8ac-4cad-4b0e-a1f8-8f791288ce03/images-(1).png",
  eleutherai:
    "https://assets.decocache.com/decocms/76eaa620-ce73-43d6-8817-272c1d498b53/images-(19).png",
  essentialai:
    "https://assets.decocache.com/decocms/c5afc6de-1e41-457e-a6dd-91810d92541e/images-(1).jpeg",
  google:
    "https://assets.decocache.com/webdraw/17df85af-1578-42ef-ae07-4300de0d1723/gemini.svg",
  gryphe:
    "https://assets.decocache.com/decocms/a5503d3b-2056-47f2-a76c-611b7416bdc8/6798c7dccaaadd0a1318d66a_66f41d1fd146c3b0b9c76453_gryphe-logo.webp",
  "ibm-granite":
    "https://assets.decocache.com/decocms/2c50018d-6f70-472d-be30-65a5e8e249f0/images-(10).png",
  inflection: DEFAULT_LOGO,
  inception:
    "https://assets.decocache.com/decocms/ff9822b8-a914-482b-bd7d-b0e46b9d5a56/images-(6).jpeg",
  kwaipilot:
    "https://assets.decocache.com/decocms/cd576e1d-1184-45ba-8162-cf2bd06d684f/images-(14).png",
  liquid: DEFAULT_LOGO,
  mancer:
    "https://assets.decocache.com/decocms/79762356-a0c5-4546-b268-ad4a0b51db51/Screenshot-2026-01-08-at-18.49.42.png",
  meituan: DEFAULT_LOGO,
  "meta-llama":
    "https://assets.decocache.com/decocms/56421cb3-488c-4cc3-83a5-16d9a303850e/images-(11).png",
  microsoft:
    "https://assets.decocache.com/decocms/0e352a51-4ea5-4f35-802e-fd82bf266683/images-(12).png",
  minimax:
    "https://assets.decocache.com/decocms/f362cc4f-7ccc-4317-afda-92e6f348fdfd/images-(2).png",
  mistralai:
    "https://assets.decocache.com/decocms/73ab9971-bbbc-40dc-99a3-5fddd9a0f340/images-(3).png",
  morph: DEFAULT_LOGO,
  moonshotai:
    "https://assets.decocache.com/decocms/b8abfea7-e8b4-4b72-b653-fdf11c9e3b66/moonshot.png",
  neversleep: DEFAULT_LOGO,
  "nex-agi":
    "https://assets.decocache.com/decocms/d2ada265-160d-4959-981d-e90210d71713/241570229.jpeg",
  nousresearch:
    "https://assets.decocache.com/decocms/496acb3d-9b5d-4759-b764-16c9ca7eb6b2/nousresearch.png",
  nvidia:
    "https://assets.decocache.com/decocms/ecca3238-fa79-4648-bb55-738f13a4293f/nvidia-7.svg",
  opengvlab:
    "https://assets.decocache.com/decocms/fb2d0c32-85f1-410a-87f4-9731dfafd248/images-(2).jpeg",
  openai:
    "https://assets.decocache.com/webdraw/15dc381c-23b4-4f6b-9ceb-9690f77a7cf5/openai.svg",
  openrouter:
    "https://assets.decocache.com/decocms/a75e4eb2-8c95-4cd3-a2f8-c49b21feab5e/openrouter.png",
  perplexity:
    "https://assets.decocache.com/decocms/3a134746-f370-4089-a3c9-fe545be0441c/images-(15).png",
  "prime-intellect": DEFAULT_LOGO,
  qwen: "https://assets.decocache.com/decocms/ab94208c-4439-4aec-a06c-c51747120e43/Qwen_logo.svg.png",
  raifle: DEFAULT_LOGO,
  relace:
    "https://assets.decocache.com/decocms/c5dbae73-3ce0-40ca-8433-c38783fb13a9/Screenshot-2026-01-08-at-18.52.09.png",
  sao10k:
    "https://assets.decocache.com/decocms/76eaa620-ce73-43d6-8817-272c1d498b53/images-(19).png",
  "stepfun-ai":
    "https://assets.decocache.com/decocms/8892b883-4905-444e-b554-648565dc7fab/images-(16).png",
  switchpoint:
    "https://assets.decocache.com/decocms/0319d595-e0dd-4d8e-a0a3-b20ff4cbddcb/images-(4).jpeg",
  tencent:
    "https://assets.decocache.com/decocms/80f2f7bd-f9ea-4fcf-b89c-c58823a389ed/images-(3).jpeg",
  thedrummer:
    "https://assets.decocache.com/decocms/5c6c09fc-cf9d-43a1-a1c3-4a1ef367b824/images-(17).png",
  thudm: DEFAULT_LOGO,
  tngtech:
    "https://assets.decocache.com/decocms/5b5648ad-f858-4687-b67b-212cf186b62d/images-(7).png",
  undi95: DEFAULT_LOGO,
  xiaomi:
    "https://assets.decocache.com/decocms/2d7191b7-fc80-4867-a431-6d443d691cfc/images-(4).png",
  "x-ai":
    "https://assets.decocache.com/webdraw/7a8003ff-8f2d-4988-8693-3feb20e87eca/xai.svg",
  "z-ai":
    "https://assets.decocache.com/decocms/12a0877f-c978-4880-88d1-09097e606e2f/Z.ai_(company_logo).svg.png",
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
    execute: async ({ context }) => {
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
    execute: async ({ context }) => {
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
    execute: async ({ context }) => {
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

const isAPICallError = (error: unknown): error is APICallError =>
  typeof error === "object" &&
  error !== null &&
  Symbol.for("vercel.ai.error") in error &&
  Symbol.for("vercel.ai.error.AI_APICallError") in error;

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
    execute: async ({ context }) => {
      const {
        modelId,
        callOptions: { abortSignal: _abortSignal, ...callOptions },
      } = context;
      env.MESH_REQUEST_CONTEXT.ensureAuthenticated();

      const apiKey = getOpenRouterApiKey(env);
      // Create OpenRouter provider
      const openrouter = createOpenRouter({ apiKey });
      const model = openrouter.languageModel(modelId);

      try {
        const callResponse = await model.doStream(
          callOptions as Parameters<(typeof model)["doStream"]>[0],
        );

        const [_, stream] = getUsageFromStream(
          callResponse.stream as ReadableStream<LanguageModelV2StreamPart>,
        );
        const response = streamToResponse(stream);

        // Return the data stream response
        return response;
      } catch (error) {
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
        // AI SDK uses 'args' (object), binding expects 'input' (JSON string)
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

      // Create OpenRouter provider
      const openrouter = createOpenRouter({ apiKey });
      const model = openrouter.languageModel(modelId);

      // Use doGenerate directly (consistent with doStream pattern)
      const result = await model.doGenerate(
        callOptions as Parameters<(typeof model)["doGenerate"]>[0],
      );

      // Transform the result to match the binding schema
      return transformGenerateResult(result) as z.infer<
        typeof GENERATE_BINDING.outputSchema
      >;
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
