import { z } from "zod";

// Common model types for search AI providers
export const SearchAIModelSchema = z.string().describe("The AI model to use");

// Message schema for chat-based interactions
export const MessageSchema = z.object({
  role: z
    .enum(["system", "user", "assistant"])
    .describe("The role of the message sender"),
  content: z.string().describe("The content of the message"),
});

export type Message = z.infer<typeof MessageSchema>;

// Common search options
export const SearchOptionsSchema = z.object({
  search_domain_filter: z
    .array(z.string())
    .optional()
    .describe("Limit search to specific domains"),
  search_recency_filter: z
    .string()
    .optional()
    .describe("Filter by time (e.g., 'week', 'day', 'month')"),
  search_context_size: z
    .enum(["low", "medium", "high", "maximum"])
    .optional()
    .describe("Amount of web search context to include"),
  return_images: z
    .boolean()
    .optional()
    .describe("Include images in search results"),
  return_related_questions: z
    .boolean()
    .optional()
    .describe("Return related questions"),
});

// Base schema for asking a simple question
export const AskInputSchema = z
  .object({
    prompt: z.string().describe("The question or prompt to ask the AI"),
    model: SearchAIModelSchema,
    max_tokens: z
      .number()
      .optional()
      .describe("Maximum number of tokens in the response"),
    temperature: z
      .number()
      .min(0)
      .max(2)
      .optional()
      .describe("Controls randomness (0-2). Lower is more focused"),
    top_p: z
      .number()
      .min(0)
      .max(1)
      .optional()
      .describe("Controls diversity via nucleus sampling (0-1)"),
  })
  .merge(SearchOptionsSchema);

export type AskInput = z.infer<typeof AskInputSchema>;

export const createAskInputSchema = <T extends string>(
  models: readonly T[],
) => {
  return z
    .object({
      prompt: z.string().describe("The question or prompt to ask the AI"),
      model: z.enum(models as [T, ...T[]]).describe("The AI model to use"),
      max_tokens: z
        .number()
        .optional()
        .describe("Maximum number of tokens in the response"),
      temperature: z
        .number()
        .min(0)
        .max(2)
        .optional()
        .describe("Controls randomness (0-2). Lower is more focused"),
      top_p: z
        .number()
        .min(0)
        .max(1)
        .optional()
        .describe("Controls diversity via nucleus sampling (0-1)"),
    })
    .merge(SearchOptionsSchema);
};

// Schema for multi-turn chat
export const ChatInputSchema = z
  .object({
    messages: z
      .array(MessageSchema)
      .min(1)
      .describe("Array of conversation messages"),
    model: SearchAIModelSchema,
    max_tokens: z
      .number()
      .optional()
      .describe("Maximum number of tokens in the response"),
    temperature: z
      .number()
      .min(0)
      .max(2)
      .optional()
      .describe("Controls randomness (0-2). Lower is more focused"),
    top_p: z
      .number()
      .min(0)
      .max(1)
      .optional()
      .describe("Controls diversity via nucleus sampling (0-1)"),
  })
  .merge(SearchOptionsSchema);

export type ChatInput = z.infer<typeof ChatInputSchema>;

export const createChatInputSchema = <T extends string>(
  models: readonly T[],
) => {
  return z
    .object({
      messages: z
        .array(MessageSchema)
        .min(1)
        .describe("Array of conversation messages"),
      model: z.enum(models as [T, ...T[]]).describe("The AI model to use"),
      max_tokens: z
        .number()
        .optional()
        .describe("Maximum number of tokens in the response"),
      temperature: z
        .number()
        .min(0)
        .max(2)
        .optional()
        .describe("Controls randomness (0-2). Lower is more focused"),
      top_p: z
        .number()
        .min(0)
        .max(1)
        .optional()
        .describe("Controls diversity via nucleus sampling (0-1)"),
    })
    .merge(SearchOptionsSchema);
};

// Output schema for search AI responses
export const SearchAIOutputSchema = z.object({
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
  sources: z
    .array(
      z.object({
        title: z.string().optional(),
        url: z.string(),
        snippet: z.string().optional(),
      }),
    )
    .optional()
    .describe("Source URLs used for the answer"),
  related_questions: z
    .array(z.string())
    .optional()
    .describe("Related questions suggested by the AI"),
  images: z
    .array(
      z.object({
        url: z.string(),
        description: z.string().optional(),
      }),
    )
    .optional()
    .describe("Images related to the search"),
});

export type SearchAIOutput = z.infer<typeof SearchAIOutputSchema>;

/**
 * Success output from the search AI execution callback
 *
 * Note: This structure mirrors SearchAIOutput to maintain consistency.
 * When updating SearchAIOutput, consider updating this type as well.
 */
export interface SearchAICallbackOutputSuccess {
  error?: false; // Explicit discriminator for type narrowing
  answer: string;
  model?: string;
  finish_reason?: string;
  usage?: {
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
  };
  sources?: Array<{
    title?: string;
    url: string;
    snippet?: string;
  }>;
  related_questions?: string[];
  images?: Array<{
    url: string;
    description?: string;
  }>;
}

/**
 * Error output from the search AI execution callback
 */
export interface SearchAICallbackOutputError {
  error: true; // Explicit discriminator for type narrowing
  message?: string;
  finish_reason?: string;
}

/**
 * Discriminated union for search AI callback output
 *
 * Use `error` property for type narrowing:
 * ```typescript
 * if (result.error) {
 *   // TypeScript knows this is SearchAICallbackOutputError
 * } else {
 *   // TypeScript knows this is SearchAICallbackOutputSuccess
 * }
 * ```
 */
export type SearchAICallbackOutput =
  | SearchAICallbackOutputSuccess
  | SearchAICallbackOutputError;
