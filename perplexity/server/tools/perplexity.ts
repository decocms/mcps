import {
  createSearchAITools,
  type SearchAICallbackOutput,
} from "@decocms/mcps-shared/search-ai";
import { assertEnvKey } from "@decocms/mcps-shared/tools/utils/api-client";
import type { Env } from "../main";
import { createPerplexityClient } from "../lib/perplexity-client";
import {
  PerplexityModels,
  PerplexityModelSchema,
  type PerplexityModel,
  type Message,
} from "../lib/types";

function getPerplexityClient(env: Env) {
  assertEnvKey(env, "PERPLEXITY_API_KEY");
  return createPerplexityClient({ apiKey: env.PERPLEXITY_API_KEY as string });
}

/**
 * Shared helper to execute Perplexity API requests
 * Eliminates code duplication between askTool and chatTool
 */
async function executePerplexityRequest({
  client,
  messages,
  model,
  max_tokens,
  temperature = 0.2,
  top_p = 0.9,
  search_domain_filter,
  return_images = false,
  return_related_questions = false,
  search_recency_filter,
  search_context_size = "high",
}: {
  client: ReturnType<typeof createPerplexityClient>;
  messages: Message[];
  model?: PerplexityModel;
  max_tokens?: number;
  temperature?: number;
  top_p?: number;
  search_domain_filter?: string[];
  return_images?: boolean;
  return_related_questions?: boolean;
  search_recency_filter?: string;
  search_context_size?: "low" | "medium" | "high" | "maximum";
}): Promise<SearchAICallbackOutput> {
  // Parse and validate model with default fallback
  const modelToUse = model ?? "sonar";
  const parsedModel: PerplexityModel = PerplexityModelSchema.parse(modelToUse);

  try {
    const response = await client.chatCompletion({
      model: parsedModel,
      messages,
      max_tokens,
      temperature,
      top_p,
      search_domain_filter,
      return_images,
      return_related_questions,
      search_recency_filter,
      web_search_options: { search_context_size },
    });

    const answer =
      response.choices[0]?.message?.content || "No response generated";

    return {
      answer,
      model: parsedModel,
      finish_reason: response.choices[0]?.finish_reason,
      usage: {
        prompt_tokens: response.usage.prompt_tokens,
        completion_tokens: response.usage.completion_tokens,
        total_tokens: response.usage.total_tokens,
      },
    };
  } catch (error) {
    return {
      error: true as const,
      message:
        error instanceof Error ? error.message : "Unknown error occurred",
    };
  }
}

export const createPerplexityTools = createSearchAITools<
  Env,
  ReturnType<typeof createPerplexityClient>,
  PerplexityModel
>({
  metadata: {
    provider: "Perplexity AI",
    description:
      "Ask questions to Perplexity AI and get web-backed answers with real-time search",
    models: PerplexityModels,
  },
  getClient: getPerplexityClient,
  askTool: {
    getContract: (env) => ({
      binding: env.PERPLEXITY_CONTRACT,
      clause: {
        clauseId: "perplexity:ask",
        amount: 1,
      },
    }),
    execute: async ({ client, input }) => {
      const { prompt, ...rest } = input;
      return executePerplexityRequest({
        client,
        messages: [{ role: "user", content: prompt }],
        ...rest,
      });
    },
  },

  chatTool: {
    getContract: (env) => ({
      binding: env.PERPLEXITY_CONTRACT,
      clause: {
        clauseId: "perplexity:chat",
        amount: 1,
      },
    }),
    execute: async ({ client, input }) => {
      return executePerplexityRequest({
        client,
        messages: input.messages as Message[],
        model: input.model,
        max_tokens: input.max_tokens,
        temperature: input.temperature,
        top_p: input.top_p,
        search_domain_filter: input.search_domain_filter,
        return_images: input.return_images,
        return_related_questions: input.return_related_questions,
        search_recency_filter: input.search_recency_filter,
        search_context_size: input.search_context_size,
      });
    },
  },
});

export const perplexityTools = createPerplexityTools;
