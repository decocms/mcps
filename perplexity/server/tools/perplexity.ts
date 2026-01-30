/**
 * Perplexity AI Tools
 *
 * Tools for asking questions and having conversations with Perplexity AI
 */

import { createPrivateTool } from "@decocms/runtime/tools";
import { z } from "zod";
import type { Env } from "../main.ts";
import { getPerplexityApiKey } from "../lib/env.ts";
import { createPerplexityClient } from "../lib/perplexity-client.ts";
import { PerplexityModels, type Message, MessageSchema } from "../lib/types.ts";

// ============================================================================
// Schema Definitions
// ============================================================================

const CommonOptionsSchema = z.object({
  model: z
    .enum(PerplexityModels)
    .optional()
    .describe("The model to use for generation. Defaults to 'sonar'"),
  max_tokens: z
    .number()
    .optional()
    .describe("Maximum number of tokens in the response"),
  temperature: z
    .number()
    .min(0)
    .max(2)
    .optional()
    .describe("Controls randomness (0-2). Lower is more focused. Default: 0.2"),
  top_p: z
    .number()
    .min(0)
    .max(1)
    .optional()
    .describe("Controls diversity via nucleus sampling (0-1). Default: 0.9"),
  search_domain_filter: z
    .array(z.string())
    .max(3)
    .optional()
    .describe("Limit search to specific domains (max 3)"),
  return_images: z
    .boolean()
    .optional()
    .describe("Include images in search results"),
  return_related_questions: z
    .boolean()
    .optional()
    .describe("Return related questions"),
  search_recency_filter: z
    .string()
    .optional()
    .describe("Filter by time (e.g., 'week', 'day', 'month')"),
  search_context_size: z
    .enum(["low", "medium", "high", "maximum"])
    .optional()
    .describe("Amount of web search context to include. Default: 'high'"),
});

const OutputSchema = z.object({
  answer: z.string().describe("The AI-generated answer"),
  model: z.string().describe("The model used"),
  finish_reason: z.string().optional().describe("Reason for completion"),
  usage: z
    .object({
      prompt_tokens: z.number(),
      completion_tokens: z.number(),
      total_tokens: z.number(),
    })
    .optional()
    .describe("Token usage information"),
});

// ============================================================================
// Ask Tool
// ============================================================================

export const createAskTool = (env: Env) =>
  createPrivateTool({
    id: "ask",
    description:
      "Ask a question to Perplexity AI and get web-backed answers with real-time search. Perfect for factual questions, research, and getting up-to-date information.",
    inputSchema: CommonOptionsSchema.extend({
      prompt: z
        .string()
        .describe("The question or prompt to ask Perplexity AI"),
    }),
    outputSchema: OutputSchema,
    execute: async ({ context }) => {
      const apiKey = getPerplexityApiKey(env);
      const client = createPerplexityClient({ apiKey });

      const response = await client.chatCompletion({
        model: context.model ?? "sonar",
        messages: [{ role: "user", content: context.prompt }],
        max_tokens: context.max_tokens,
        temperature: context.temperature ?? 0.2,
        top_p: context.top_p ?? 0.9,
        search_domain_filter: context.search_domain_filter,
        return_images: context.return_images ?? false,
        return_related_questions: context.return_related_questions ?? false,
        search_recency_filter: context.search_recency_filter,
        web_search_options: {
          search_context_size: context.search_context_size ?? "high",
        },
      });

      const answer =
        response.choices[0]?.message?.content || "No response generated";

      return {
        answer,
        model: context.model ?? "sonar",
        finish_reason: response.choices[0]?.finish_reason,
        usage: {
          prompt_tokens: response.usage.prompt_tokens,
          completion_tokens: response.usage.completion_tokens,
          total_tokens: response.usage.total_tokens,
        },
      };
    },
  });

// ============================================================================
// Chat Tool
// ============================================================================

// Helper to normalize messages - converts strings to user messages
const normalizeMessages = (val: unknown): unknown => {
  // If string, try to parse as JSON first
  if (typeof val === "string") {
    try {
      val = JSON.parse(val);
    } catch {
      // If not valid JSON, treat as a single user message
      return [{ role: "user", content: val }];
    }
  }

  // If array, normalize each item
  if (Array.isArray(val)) {
    return val.map((item) => {
      if (typeof item === "string") {
        return { role: "user", content: item };
      }
      return item;
    });
  }

  return val;
};

export const createChatTool = (env: Env) =>
  createPrivateTool({
    id: "chat",
    description:
      "Have a multi-turn conversation with Perplexity AI. Allows providing message history for more contextual responses with web-backed answers.",
    inputSchema: CommonOptionsSchema.extend({
      messages: z
        .preprocess(normalizeMessages, z.array(MessageSchema).min(1))
        .describe(
          "Array of conversation messages. Each message should have 'role' (system/user/assistant) and 'content'. Simple strings are converted to user messages.",
        ),
    }),
    outputSchema: OutputSchema,
    execute: async ({ context }) => {
      const apiKey = getPerplexityApiKey(env);
      const client = createPerplexityClient({ apiKey });

      const response = await client.chatCompletion({
        model: context.model ?? "sonar",
        messages: context.messages as Message[],
        max_tokens: context.max_tokens,
        temperature: context.temperature ?? 0.2,
        top_p: context.top_p ?? 0.9,
        search_domain_filter: context.search_domain_filter,
        return_images: context.return_images ?? false,
        return_related_questions: context.return_related_questions ?? false,
        search_recency_filter: context.search_recency_filter,
        web_search_options: {
          search_context_size: context.search_context_size ?? "high",
        },
      });

      const answer =
        response.choices[0]?.message?.content || "No response generated";

      return {
        answer,
        model: context.model ?? "sonar",
        finish_reason: response.choices[0]?.finish_reason,
        usage: {
          prompt_tokens: response.usage.prompt_tokens,
          completion_tokens: response.usage.completion_tokens,
          total_tokens: response.usage.total_tokens,
        },
      };
    },
  });

// ============================================================================
// Export all perplexity tools
// ============================================================================

export const perplexityTools = [createAskTool, createChatTool];
