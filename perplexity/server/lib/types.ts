// Types for Perplexity API requests and responses
import { z } from "zod";

// Message schema for chat-based interactions
export const MessageSchema = z.object({
  role: z
    .enum(["system", "user", "assistant"])
    .describe("The role of the message sender"),
  content: z.string().describe("The content of the message"),
});

export type Message = z.infer<typeof MessageSchema>;

export const PerplexityModels = [
  "sonar",
  "sonar-pro",
  "sonar-deep-research",
  "sonar-reasoning-pro",
  "sonar-reasoning",
] as const;

export const PerplexityModelSchema = z.enum(PerplexityModels);
export type PerplexityModel = z.infer<typeof PerplexityModelSchema>;

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
