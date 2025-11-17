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
import type { ChatMessage, ProviderPreferences } from "../../lib/types.ts";

const MessageSchema = z.object({
  role: z.enum(["user", "assistant", "system"]).describe("Message role"),
  content: z.string().describe("Message content"),
  name: z.string().optional().describe("Optional name for the message sender"),
});

const ProviderPreferencesSchema = z.object({
  sort: z
    .enum(["price", "throughput", "latency"])
    .optional()
    .describe("Sort providers by this preference"),
  only: z
    .array(z.string())
    .optional()
    .describe(
      "Only use these specific providers (e.g., ['OpenAI', 'Anthropic'])",
    ),
  exclude: z
    .array(z.string())
    .optional()
    .describe("Exclude these providers from selection"),
  requireParameters: z
    .boolean()
    .optional()
    .describe("Require that providers support all requested parameters"),
  allowFallbacks: z
    .boolean()
    .optional()
    .describe("Allow fallback to other providers on failure"),
});

export const createChatCompletionTool = (env: Env) =>
  createPrivateTool({
    id: "OPENROUTER_CHAT_COMPLETION",
    description:
      "Send a non-streaming chat completion request to OpenRouter. Supports single model selection, " +
      "automatic model routing (openrouter/auto), fallback chains, and provider preferences. " +
      "Returns the complete response when generation is finished, including token usage and cost estimation. " +
      "Perfect for standard chat interactions where you don't need real-time streaming.",
    inputSchema: z.object({
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
      responseFormat: z
        .object({ type: z.literal("json_object") })
        .optional()
        .describe(
          "Request JSON output format. Note: Only supported by some models. Check model details.",
        ),
      provider: ProviderPreferencesSchema.optional().describe(
        "Provider routing preferences to optimize selection by price, speed, or specific providers",
      ),
      user: z
        .string()
        .optional()
        .describe(
          "Unique identifier for your end-user (helps with abuse detection)",
        ),
    }),
    outputSchema: z.object({
      id: z
        .string()
        .describe(
          "Generation ID (use with OPENROUTER_GET_GENERATION for details)",
        ),
      model: z.string().describe("Actual model that generated the response"),
      content: z.string().describe("The generated text response"),
      finishReason: z
        .string()
        .describe(
          "Why generation stopped: 'stop' (natural end), 'length' (hit token limit), 'content_filter' (moderated), etc.",
        ),
      usage: z.object({
        promptTokens: z.number().describe("Tokens in the prompt"),
        completionTokens: z.number().describe("Tokens in the completion"),
        totalTokens: z.number().describe("Total tokens used"),
      }),
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
        responseFormat?: { type: "json_object" };
        provider?: ProviderPreferences;
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
        provider,
        user,
      } = context;

      const state = env.DECO_CHAT_REQUEST_CONTEXT.state;
      const resolvedTemperature =
        temperature ?? state.defaultTemperature ?? DEFAULT_TEMPERATURE;
      const resolvedMaxTokens = maxTokens ?? state.defaultMaxTokens;

      // Validate parameters
      validateChatParams({
        messages,
        model,
        temperature: resolvedTemperature,
        maxTokens: resolvedMaxTokens,
        topP,
      });

      const client = new OpenRouterClient({
        apiKey: state.apiKey,
        siteName: state.siteName,
        siteUrl: state.siteUrl,
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
        response_format: responseFormat,
        models,
        provider,
        user,
      };

      // Send completion request
      const response = await client.chatCompletion(params);

      // Extract the response
      const choice = response.choices[0];
      const content = choice.message.content || "";

      // Calculate cost if usage info is available
      let estimatedCost;
      if (response.usage) {
        // Try to get actual model pricing
        try {
          const modelInfo = await client.getModel(response.model);
          estimatedCost = calculateChatCost(
            response.usage.prompt_tokens,
            response.usage.completion_tokens,
            modelInfo.pricing,
          );
        } catch (error) {
          // If we can't get model info, skip cost calculation
          console.warn("Could not calculate cost:", error);
        }
      }

      return {
        id: response.id,
        model: response.model,
        content,
        finishReason: choice.finish_reason || "unknown",
        usage: response.usage
          ? {
              promptTokens: response.usage.prompt_tokens,
              completionTokens: response.usage.completion_tokens,
              totalTokens: response.usage.total_tokens,
            }
          : {
              promptTokens: 0,
              completionTokens: 0,
              totalTokens: 0,
            },
        estimatedCost,
      };
    },
  });
