#!/usr/bin/env bun
/**
 * OpenRouter MCP Server - Stdio Transport
 *
 * This allows running the OpenRouter MCP locally via stdio,
 * without needing to manage an HTTP server.
 *
 * Usage:
 *   OPENROUTER_API_KEY=sk-... bun server/stdio.ts
 *
 * In Mesh, add as STDIO connection:
 *   Command: bun
 *   Args: /path/to/openrouter/server/stdio.ts
 *   Env: OPENROUTER_API_KEY=sk-...
 */

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { createOpenRouter } from "@openrouter/ai-sdk-provider";
import type { LanguageModelV2CallOptions } from "@ai-sdk/provider";
import { OpenRouterClient } from "./lib/openrouter-client.ts";
import { z } from "zod";
import { type ModelCollectionEntitySchema } from "@decocms/bindings/llm";
import { WELL_KNOWN_MODEL_IDS } from "./tools/models/well-known.ts";
import { compareModels, recommendModelsForTask } from "./tools/models/utils.ts";

// ============================================================================
// Environment
// ============================================================================

const OPENROUTER_API_KEY = process.env.OPENROUTER_API_KEY;
if (!OPENROUTER_API_KEY) {
  console.error("Error: OPENROUTER_API_KEY environment variable is required");
  process.exit(1);
}

// ============================================================================
// Constants
// ============================================================================

const OPENROUTER_PROVIDER = "openrouter" as const;
const DEFAULT_LOGO =
  "https://assets.decocache.com/decocms/bc2ca488-2bae-4aac-8d3e-ead262dad764/agent.png";
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
// Helper Functions (simplified from llm-binding.ts)
// ============================================================================

type ListedModel = Awaited<ReturnType<OpenRouterClient["listModels"]>>[number];

function toNumberOrNull(value?: string): number | null {
  if (!value?.length) return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function extractOutputLimit(model: ListedModel): number | null {
  const topProviderLimit = model.top_provider?.max_completion_tokens;
  if (typeof topProviderLimit === "number") return topProviderLimit;
  const perRequestLimit = model.per_request_limits?.completion_tokens;
  if (perRequestLimit) {
    const parsed = Number(perRequestLimit);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

function extractCapabilities(model: ListedModel): string[] {
  const capabilities: string[] = ["text"];
  if (model.architecture?.modality?.includes("image"))
    capabilities.push("vision");
  if (model.supported_generation_methods?.includes("tools"))
    capabilities.push("tools");
  if (model.supported_generation_methods?.includes("json_mode"))
    capabilities.push("json-mode");
  return capabilities;
}

function extractProviderLogo(modelId: string): string {
  const provider = modelId.split("/")[0] || "";
  return PROVIDER_LOGOS[provider] ?? DEFAULT_LOGO;
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
    created_at: model.created
      ? new Date(model.created * 1000).toISOString()
      : now,
    updated_at: now,
    created_by: undefined,
    updated_by: undefined,
    logo: extractProviderLogo(model.id),
    description: model.description ?? null,
    capabilities: extractCapabilities(model),
    provider: OPENROUTER_PROVIDER,
    limits:
      contextWindow > 0 || maxOutputTokens > 0
        ? { contextWindow, maxOutputTokens }
        : null,
    costs:
      inputCost !== null || outputCost !== null
        ? { input: inputCost ?? 0, output: outputCost ?? 0 }
        : null,
  };
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
// MCP Server Setup
// ============================================================================

async function main() {
  const server = new McpServer({
    name: "openrouter",
    version: "1.0.0",
  });

  const client = new OpenRouterClient({ apiKey: OPENROUTER_API_KEY });
  const openrouter = createOpenRouter({ apiKey: OPENROUTER_API_KEY });

  // ============================================================================
  // COLLECTION_LLM_LIST - List all available models
  // ============================================================================
  server.tool(
    "COLLECTION_LLM_LIST",
    "List all available models from OpenRouter with filtering and pagination",
    {
      where: z.any().optional().describe("Filter expression"),
      orderBy: z.any().optional().describe("Sort order"),
      limit: z.number().optional().default(50).describe("Max results"),
      offset: z.number().optional().default(0).describe("Pagination offset"),
    },
    async ({ limit = 50, offset = 0 }) => {
      const models = await client.listModels();
      const sorted = sortModelsByWellKnown(models);
      const paginated = sorted.slice(offset, offset + limit);

      return {
        content: [
          {
            type: "text",
            text: JSON.stringify({
              items: paginated.map(transformToLLMEntity),
              totalCount: sorted.length,
              hasMore: sorted.length > offset + limit,
            }),
          },
        ],
      };
    },
  );

  // ============================================================================
  // COLLECTION_LLM_GET - Get a single model by ID
  // ============================================================================
  server.tool(
    "COLLECTION_LLM_GET",
    "Get detailed information about a specific OpenRouter model",
    {
      id: z
        .string()
        .describe("The model ID (e.g., 'anthropic/claude-3.5-sonnet')"),
    },
    async ({ id }) => {
      try {
        const model = await client.getModel(id);
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify({ item: transformToLLMEntity(model) }),
            },
          ],
        };
      } catch {
        return {
          content: [{ type: "text", text: JSON.stringify({ item: null }) }],
        };
      }
    },
  );

  // ============================================================================
  // LLM_METADATA - Get model metadata
  // ============================================================================
  server.tool(
    "LLM_METADATA",
    "Get metadata about a model's capabilities including supported URL patterns",
    {
      modelId: z.string().describe("The model ID"),
    },
    async ({ modelId }) => {
      try {
        const model = await client.getModel(modelId);
        const supportedUrls: Record<string, string[]> = {
          "text/*": ["data:*"],
        };
        if (model.architecture?.modality?.includes("image")) {
          supportedUrls["image/*"] = ["https://*", "data:*"];
        }
        return {
          content: [{ type: "text", text: JSON.stringify({ supportedUrls }) }],
        };
      } catch {
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify({ supportedUrls: { "text/*": ["data:*"] } }),
            },
          ],
        };
      }
    },
  );

  // ============================================================================
  // LLM_DO_GENERATE - Generate a complete response (non-streaming)
  // ============================================================================
  server.tool(
    "LLM_DO_GENERATE",
    "Generate a complete language model response using OpenRouter (non-streaming)",
    {
      modelId: z.string().describe("The model ID to use"),
      callOptions: z
        .any()
        .optional()
        .describe("Language model call options (prompt, messages, etc.)"),
    },
    async ({ modelId, callOptions: rawCallOptions }) => {
      const { abortSignal: _abortSignal, ...callOptions } =
        rawCallOptions ?? {};

      const model = openrouter.languageModel(modelId);
      const result = await model.doGenerate(
        callOptions as LanguageModelV2CallOptions,
      );

      // Clean up non-serializable data
      const cleanResult = {
        ...result,
        request: result.request ? { body: undefined } : undefined,
        response: result.response
          ? {
              id: result.response.id,
              timestamp: result.response.timestamp,
              modelId: result.response.modelId,
              headers: result.response.headers,
            }
          : undefined,
      };

      return {
        content: [{ type: "text", text: JSON.stringify(cleanResult) }],
      };
    },
  );

  // ============================================================================
  // LLM_DO_STREAM - Stream a response (simplified for stdio)
  // ============================================================================
  server.tool(
    "LLM_DO_STREAM",
    "Stream a language model response in real-time using OpenRouter. Note: In stdio mode, this returns the full response (streaming not supported via stdio transport).",
    {
      modelId: z.string().describe("The model ID to use"),
      callOptions: z
        .any()
        .optional()
        .describe("Language model call options (prompt, messages, etc.)"),
    },
    async ({ modelId, callOptions: rawCallOptions }) => {
      // In stdio mode, we can't truly stream, so we use doGenerate instead
      const { abortSignal: _abortSignal, ...callOptions } =
        rawCallOptions ?? {};

      const model = openrouter.languageModel(modelId);
      const result = await model.doGenerate(
        callOptions as LanguageModelV2CallOptions,
      );

      // Clean up non-serializable data
      const cleanResult = {
        ...result,
        request: result.request ? { body: undefined } : undefined,
        response: result.response
          ? {
              id: result.response.id,
              timestamp: result.response.timestamp,
              modelId: result.response.modelId,
              headers: result.response.headers,
            }
          : undefined,
      };

      return {
        content: [{ type: "text", text: JSON.stringify(cleanResult) }],
      };
    },
  );

  // ============================================================================
  // COMPARE_MODELS - Compare multiple models side-by-side
  // ============================================================================
  server.tool(
    "COMPARE_MODELS",
    "Compare multiple OpenRouter models side-by-side to help choose the best model for a specific use case. Compares pricing, context length, capabilities, and performance characteristics.",
    {
      modelIds: z
        .array(z.string())
        .min(2)
        .max(5)
        .describe(
          "Array of 2-5 model IDs to compare (e.g., ['openai/gpt-4o', 'anthropic/claude-3.5-sonnet'])",
        ),
      criteria: z
        .array(z.enum(["price", "context_length", "modality", "moderation"]))
        .optional()
        .describe("Specific criteria to focus on in comparison"),
    },
    async ({ modelIds, criteria }) => {
      const allModels = await client.listModels();
      const result = compareModels(modelIds, allModels, criteria);
      return {
        content: [{ type: "text", text: JSON.stringify(result) }],
      };
    },
  );

  // ============================================================================
  // RECOMMEND_MODEL - Get model recommendations for a task
  // ============================================================================
  server.tool(
    "RECOMMEND_MODEL",
    "Get intelligent model recommendations based on your task description and requirements. Analyzes your task and suggests the most suitable models.",
    {
      taskDescription: z
        .string()
        .describe(
          "Description of your task (e.g., 'generate Python code', 'analyze documents')",
        ),
      requirements: z
        .object({
          maxCostPer1MTokens: z
            .number()
            .positive()
            .optional()
            .describe("Maximum budget per 1M tokens in dollars"),
          minContextLength: z
            .number()
            .positive()
            .optional()
            .describe("Minimum required context length in tokens"),
          requiredModality: z
            .enum(["text->text", "text+image->text", "text->image"])
            .optional()
            .describe("Required model capability"),
          prioritize: z
            .enum(["cost", "quality", "speed"])
            .default("quality")
            .optional()
            .describe("What to prioritize in recommendations"),
        })
        .optional()
        .describe("Optional requirements and constraints"),
    },
    async ({ taskDescription, requirements = {} }) => {
      const allModels = await client.listModels();
      const recommendations = recommendModelsForTask(
        taskDescription,
        requirements,
        allModels,
      );
      return {
        content: [{ type: "text", text: JSON.stringify({ recommendations }) }],
      };
    },
  );

  // ============================================================================
  // Connect to stdio transport
  // ============================================================================
  const transport = new StdioServerTransport();
  await server.connect(transport);

  console.error("[openrouter] MCP server running via stdio");
  console.error(
    "[openrouter] Available tools: COLLECTION_LLM_LIST, COLLECTION_LLM_GET, LLM_METADATA, LLM_DO_GENERATE, LLM_DO_STREAM, COMPARE_MODELS, RECOMMEND_MODEL",
  );
}

main().catch((error) => {
  console.error("Fatal error:", error);
  process.exit(1);
});
