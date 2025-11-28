// Types for Perplexity API requests and responses
import { z } from "zod";
import {
  AskInputSchema,
  ChatInputSchema,
  type Message as SearchAIMessage,
  MessageSchema as SearchAIMessageSchema,
} from "@decocms/mcps-shared/search-ai";

export type Message = SearchAIMessage;
export const MessageSchema = SearchAIMessageSchema;

export const PerplexityModels = [
  "sonar",
  "sonar-pro",
  "sonar-deep-research",
  "sonar-reasoning-pro",
  "sonar-reasoning",
] as const;

export type PerplexityModel = (typeof PerplexityModels)[number];

// Web search options
export interface WebSearchOptions {
  search_context_size?: "low" | "medium" | "high" | "maximum";
}

// Response format options
export interface ResponseFormat {
  type?: "json_object";
  schema?: Record<string, unknown>;
}

// Chat completion response
export interface ChatCompletion {
  id: string;
  model: string;
  object: string;
  created: number;
  choices: Array<{
    index: number;
    message: Message;
    finish_reason: string;
  }>;
  usage: {
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
  };
}

// Request body for chat completions
export interface ChatCompletionRequest {
  model: string;
  messages: Message[];
  max_tokens?: number;
  temperature?: number;
  top_p?: number;
  search_domain_filter?: string[];
  return_images?: boolean;
  return_related_questions?: boolean;
  search_recency_filter?: string;
  top_k?: number;
  stream?: boolean;
  presence_penalty?: number;
  frequency_penalty?: number;
  response_format?: ResponseFormat;
  web_search_options?: WebSearchOptions;
}

// Zod Schemas for validation and documentation

// Schema for chat completion
export const ChatCompletionSchema = z.object({
  prompt: z.string().describe("The text prompt or question to ask Perplexity"),
  model: z
    .enum([
      "sonar",
      "sonar-pro",
      "sonar-deep-research",
      "sonar-reasoning-pro",
      "sonar-reasoning",
    ])
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
    .default(0.2)
    .describe("Controls randomness (0-2). Lower is more focused"),
  top_p: z
    .number()
    .min(0)
    .max(1)
    .optional()
    .default(0.9)
    .describe("Controls diversity via nucleus sampling (0-1)"),
  search_domain_filter: z
    .array(z.string())
    .max(3)
    .optional()
    .describe("Limit search to specific domains (max 3)"),
  return_images: z
    .boolean()
    .optional()
    .default(false)
    .describe("Include images in search results"),
  return_related_questions: z
    .boolean()
    .optional()
    .default(false)
    .describe("Return related questions"),
  search_recency_filter: z
    .string()
    .optional()
    .describe("Filter by time (e.g., 'week', 'day', 'month')"),
  search_context_size: z
    .enum(["low", "medium", "high", "maximum"])
    .optional()
    .default("high")
    .describe("Amount of web search context to include"),
});

// Schema for chat with messages
export const ChatWithMessagesSchema = z.object({
  messages: z
    .array(MessageSchema)
    .min(1)
    .describe("Array of conversation messages"),
  model: z
    .enum([
      "sonar",
      "sonar-pro",
      "sonar-deep-research",
      "sonar-reasoning-pro",
      "sonar-reasoning",
    ])
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
    .default(0.2)
    .describe("Controls randomness (0-2). Lower is more focused"),
  top_p: z
    .number()
    .min(0)
    .max(1)
    .optional()
    .default(0.9)
    .describe("Controls diversity via nucleus sampling (0-1)"),
  search_domain_filter: z
    .array(z.string())
    .max(3)
    .optional()
    .describe("Limit search to specific domains (max 3)"),
  return_images: z
    .boolean()
    .optional()
    .default(false)
    .describe("Include images in search results"),
  return_related_questions: z
    .boolean()
    .optional()
    .default(false)
    .describe("Return related questions"),
  search_recency_filter: z
    .string()
    .optional()
    .describe("Filter by time (e.g., 'week', 'day', 'month')"),
  search_context_size: z
    .enum(["low", "medium", "high", "maximum"])
    .optional()
    .default("high")
    .describe("Amount of web search context to include"),
});
