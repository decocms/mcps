/**
 * Tool: Chat Completion
 * Send a non-streaming chat completion request
 */

import { createPrivateTool } from "@decocms/runtime/mastra";
import { z } from "zod";
import type { Env } from "../../main.ts";
import { OpenRouterClient } from "../../lib/openrouter-client.ts";
import { AUTO_ROUTER_MODEL, DEFAULT_TEMPERATURE } from "../../constants.ts";
import { calculateChatCost, validateChatParams } from "./utils.ts";
import type { ChatMessage } from "../../lib/types.ts";
import {
  settleMicroDollarsContract,
  toMicroDollarUnits,
} from "../../lib/chat-contract.ts";
import { getOpenRouterApiKey } from "../../lib/env.ts";

const ContentPartSchema = z.discriminatedUnion("type", [
  z
    .object({
      type: z.literal("text"),
      text: z.string().optional(),
    })
    .passthrough(),
  z
    .object({
      type: z.literal("image_url"),
      image_url: z
        .object({
          url: z.string(),
          detail: z.string().optional(),
        })
        .passthrough(),
    })
    .passthrough(),
]);

const MessageContentSchema = z
  .union([z.string(), z.array(ContentPartSchema)])
  .describe("Message content (text or structured multimodal parts)");

const MessageSchema = z.object({
  role: z
    .enum(["user", "assistant", "system", "tool"])
    .describe("Message role"),
  content: MessageContentSchema,
  name: z.string().optional().describe("Optional name for the message sender"),
  tool_call_id: z
    .string()
    .optional()
    .describe("Tool call ID for tool-role messages"),
});

const jsonResponseFormatOptions = z.enum(["json_object"]);

export const CompletionInputSchema = z
  .object({
    messages: z
      .array(MessageSchema)
      .min(1)
      .describe(
        "Array of messages in the conversation. Each message has a role (user/assistant/system) and content.",
      ),
    model: z
      .string()
      .default(AUTO_ROUTER_MODEL)
      .optional()
      .describe(
        "Model ID to use (e.g., 'openai/gpt-4o', 'anthropic/claude-3.5-sonnet'). Use 'openrouter/auto' for automatic selection. Default: openrouter/auto",
      ),
    models: z
      .array(z.string())
      .optional()
      .describe(
        "Fallback chain: array of model IDs to try in sequence if the primary model fails (e.g., ['openai/gpt-4o', 'anthropic/claude-3.5-sonnet'])",
      ),
    temperature: z
      .number()
      .min(0)
      .max(2)
      .optional()
      .describe(
        "Sampling temperature (0-2). Higher values make output more random. Default: 1",
      ),
    maxTokens: z
      .number()
      .positive()
      .optional()
      .describe("Maximum tokens to generate in the completion"),
    topP: z
      .number()
      .min(0)
      .max(1)
      .optional()
      .describe(
        "Nucleus sampling parameter (0-1). Alternative to temperature.",
      ),
    frequencyPenalty: z
      .number()
      .min(-2)
      .max(2)
      .optional()
      .describe("Reduce repetition of tokens by frequency (-2 to 2)"),
    presencePenalty: z
      .number()
      .min(-2)
      .max(2)
      .optional()
      .describe("Reduce repetition of topics (-2 to 2)"),
    stop: z
      .union([z.string(), z.array(z.string())])
      .optional()
      .describe("Stop sequences to end generation early"),
    responseFormat: jsonResponseFormatOptions
      .optional()
      .describe(
        "Request JSON output format. Note: Only supported by some models. Check model details.",
      ),
    /*
  provider: ProviderPreferencesSchema.optional().describe(
    "Provider routing preferences to optimize selection by price, speed, or specific providers",
  ),
  */
    user: z
      .string()
      .optional()
      .describe(
        "Unique identifier for your end-user (helps with abuse detection)",
      ),
  })
  .passthrough();

/*
const ProviderPreferencesSchema = z.object({
  sort: z.enum(["price", "throughput", "latency"]).optional(),
  only: z.array(z.string()).optional(),
  exclude: z.array(z.string()).optional(),
  requireParameters: z.boolean().optional(),
  allowFallbacks: z.boolean().optional(),
});
*/

export const createChatCompletionTool = (env: Env) =>
  createPrivateTool({
    id: "CHAT_COMPLETION",
    description:
      "Send a non-streaming chat completion request to OpenRouter. Supports single model selection, " +
      "automatic model routing (openrouter/auto) and fallback chains. " +
      "Returns the complete response when generation is finished, including token usage and cost estimation. " +
      "Perfect for standard chat interactions where you don't need real-time streaming.",
    inputSchema: CompletionInputSchema,
    outputSchema: z.object({
      id: z
        .string()
        .describe("Generation ID (use with GET_GENERATION for details)"),
      model: z.string().describe("Actual model that generated the response"),
      content: MessageContentSchema.describe(
        "The generated response content (text or structured multimodal parts)",
      ),
      finishReason: z
        .string()
        .describe(
          "Why generation stopped: 'stop' (natural end), 'length' (hit token limit), 'content_filter' (moderated), etc.",
        ),
      usage: z
        .object({
          prompt_tokens: z.number().describe("Tokens in the prompt"),
          completion_tokens: z.number().describe("Tokens in the completion"),
          total_tokens: z.number().describe("Total tokens used"),
        })
        .optional()
        .describe("Token usage information (may be unavailable)"),
      estimatedCost: z
        .object({
          prompt: z
            .number()
            .describe("Estimated cost for prompt tokens in dollars"),
          completion: z
            .number()
            .describe("Estimated cost for completion tokens in dollars"),
          total: z.number().describe("Total estimated cost in dollars"),
        })
        .optional()
        .describe("Estimated cost based on model pricing"),
    }),
    execute: async ({
      context,
    }: {
      context: {
        messages: ChatMessage[];
        model?: string;
        models?: string[];
        temperature?: number;
        maxTokens?: number;
        topP?: number;
        frequencyPenalty?: number;
        presencePenalty?: number;
        stop?: string | string[];
        responseFormat?: z.infer<typeof jsonResponseFormatOptions>;
        // provider?: ProviderPreferences;
        user?: string;
      };
    }) => {
      const {
        messages,
        model = AUTO_ROUTER_MODEL,
        models,
        temperature,
        maxTokens,
        topP,
        frequencyPenalty,
        presencePenalty,
        stop,
        responseFormat,
        // provider,
        user,
      } = context;

      const apiKey = getOpenRouterApiKey(env);
      const resolvedTemperature = temperature ?? DEFAULT_TEMPERATURE;
      const resolvedMaxTokens = maxTokens;

      /*
      if (hasProviderPreferences(provider)) {
        throw new Error(
          "Provider preferences are not supported by the OpenRouter TypeScript SDK yet. Please omit the `provider` field and rely on explicit model routing instead.",
        );
      }
      */

      // Validate parameters
      validateChatParams({
        messages,
        model,
        temperature: resolvedTemperature,
        maxTokens: resolvedMaxTokens,
        topP,
      });

      const client = new OpenRouterClient({
        apiKey,
      });

      // Prepare request parameters
      const params = {
        model,
        messages,
        temperature: resolvedTemperature,
        max_tokens: resolvedMaxTokens,
        top_p: topP,
        frequency_penalty: frequencyPenalty,
        presence_penalty: presencePenalty,
        stop,
        response_format: responseFormat ? { type: responseFormat } : undefined,
        models,
        user,
      };

      // Send completion request
      const response = await client.chatCompletion(params);

      // Extract the response
      if (!Array.isArray(response.choices) || response.choices.length === 0) {
        throw new Error("OpenRouter chat completion returned no choices");
      }

      const choice = response.choices[0];
      const content = choice.message?.content ?? "";

      // Calculate cost if usage info is available
      let estimatedCost;
      let contractMicroUnits: number | undefined;
      if (response.usage) {
        // Try to get actual model pricing
        try {
          const modelInfo = await client.getModel(response.model);
          estimatedCost = calculateChatCost(
            response.usage.prompt_tokens,
            response.usage.completion_tokens,
            modelInfo.pricing,
          );
          contractMicroUnits = toMicroDollarUnits(estimatedCost.total);
        } catch (error) {
          // If we can't get model info, skip cost calculation
          console.warn("Could not calculate cost:", error);
        }
      }

      if (contractMicroUnits && contractMicroUnits > 0) {
        await settleMicroDollarsContract(env, contractMicroUnits);
      }

      return {
        id: response.id,
        model: response.model,
        content,
        finishReason: choice.finish_reason || "unknown",
        usage: response.usage
          ? {
              prompt_tokens: response.usage.prompt_tokens,
              completion_tokens: response.usage.completion_tokens,
              total_tokens: response.usage.total_tokens,
            }
          : undefined,
        estimatedCost,
      };
    },
  });

/*
function hasProviderPreferences(provider?: ProviderPreferences): boolean {
  if (!provider) {
    return false;
  }

  return Object.values(provider).some((value) => {
    if (Array.isArray(value)) {
      return value.length > 0;
    }
    if (value && typeof value === "object") {
      return Object.keys(value as Record<string, unknown>).length > 0;
    }
    return value !== undefined;
  });
}
*/
