/**
 * Tool: Get Model
 * Get detailed information about a specific OpenRouter model
 */

import { createPrivateTool } from "@decocms/runtime/mastra";
import { z } from "zod";
import type { Env } from "../../main.ts";
import { OpenRouterClient } from "../../lib/openrouter-client.ts";

export const createGetModelTool = (env: Env) =>
  createPrivateTool({
    id: "GET_MODEL",
    description:
      "Get detailed information about a specific OpenRouter model including pricing, capabilities, " +
      "context length, provider information, and supported features. Use this to learn about a model " +
      "before using it for chat completions. Model IDs follow the format 'provider/model-name' " +
      "(e.g., 'openai/gpt-4o', 'anthropic/claude-3.5-sonnet').",
    inputSchema: z.object({
      modelId: z
        .string()
        .describe(
          "The model ID in format 'provider/model-name' (e.g., 'openai/gpt-4o', 'anthropic/claude-3.5-sonnet', 'google/gemini-2.0-flash-exp')",
        ),
    }),
    outputSchema: z.object({
      id: z.string().describe("Unique model identifier"),
      name: z.string().describe("Human-readable model name"),
      description: z.string().optional().describe("Detailed model description"),
      contextLength: z
        .number()
        .describe(
          "Maximum context length in tokens (includes prompt + completion)",
        ),
      pricing: z.object({
        prompt: z.string().describe("Cost per 1M prompt tokens in dollars"),
        completion: z
          .string()
          .describe("Cost per 1M completion tokens in dollars"),
        request: z
          .string()
          .optional()
          .describe("Fixed cost per request (if applicable)"),
        image: z
          .string()
          .optional()
          .describe("Cost per image input (if applicable)"),
      }),
      topProvider: z
        .object({
          contextLength: z.number().optional(),
          maxCompletionTokens: z
            .number()
            .optional()
            .describe("Maximum tokens in completion"),
          isModerated: z
            .boolean()
            .describe("Whether provider moderates content"),
        })
        .optional()
        .describe("Information about the recommended provider"),
      architecture: z
        .object({
          modality: z
            .string()
            .describe(
              "Model capability (e.g., 'text->text', 'text+image->text')",
            ),
          tokenizer: z.string().describe("Tokenizer used by the model"),
          instructType: z
            .string()
            .optional()
            .describe("Instruction format if applicable"),
        })
        .optional(),
      perRequestLimits: z
        .object({
          promptTokens: z.string().optional(),
          completionTokens: z.string().optional(),
        })
        .optional()
        .describe("Per-request token limits if applicable"),
    }),
    execute: async ({ context }: { context: { modelId: string } }) => {
      const { modelId } = context;
      const state = env.DECO_CHAT_REQUEST_CONTEXT.state;
      const client = new OpenRouterClient({
        apiKey: state.apiKey,
        siteName: state.siteName,
        siteUrl: state.siteUrl,
      });

      const model = await client.getModel(modelId);

      return {
        id: model.id,
        name: model.name,
        description: model.description,
        contextLength: model.context_length,
        pricing: {
          prompt: model.pricing.prompt,
          completion: model.pricing.completion,
          request: model.pricing.request,
          image: model.pricing.image,
        },
        topProvider: model.top_provider
          ? {
              contextLength: model.top_provider.context_length,
              maxCompletionTokens: model.top_provider.max_completion_tokens,
              isModerated: model.top_provider.is_moderated,
            }
          : undefined,
        architecture: model.architecture
          ? {
              modality: model.architecture.modality,
              tokenizer: model.architecture.tokenizer,
              instructType: model.architecture.instruct_type,
            }
          : undefined,
        perRequestLimits: model.per_request_limits
          ? {
              promptTokens: model.per_request_limits.prompt_tokens,
              completionTokens: model.per_request_limits.completion_tokens,
            }
          : undefined,
      };
    },
  });
