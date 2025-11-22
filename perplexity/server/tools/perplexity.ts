import { createSearchAITools } from "@decocms/mcps-shared/search-ai";
import { assertEnvKey } from "@decocms/mcps-shared/tools/utils/api-client";
import type { Env } from "../main";
import { PerplexityClient } from "../lib/perplexity-client";
import type { Message } from "../lib/types";

function getPerplexityClient(env: Env): PerplexityClient {
  assertEnvKey(env.state, "PERPLEXITY_API_KEY");
  return new PerplexityClient({ apiKey: env.state.PERPLEXITY_API_KEY });
}

export const createPerplexityTools = createSearchAITools<Env, PerplexityClient>(
  {
    metadata: {
      provider: "Perplexity AI",
      description:
        "Ask questions to Perplexity AI and get web-backed answers with real-time search",
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
        const {
          prompt,
          model = "sonar",
          max_tokens,
          temperature = 0.2,
          top_p = 0.9,
          search_domain_filter,
          return_images = false,
          return_related_questions = false,
          search_recency_filter,
          search_context_size = "high",
        } = input;

        try {
          const response = await client.chatCompletion({
            model,
            messages: [{ role: "user", content: prompt }],
            max_tokens,
            temperature,
            top_p,
            search_domain_filter,
            return_images,
            return_related_questions,
            search_recency_filter,
            web_search_options: {
              search_context_size,
            },
          });

          const answer =
            response.choices[0]?.message?.content || "No response generated";

          return {
            answer,
            model: response.model,
            finish_reason: response.choices[0]?.finish_reason,
            usage: {
              prompt_tokens: response.usage.prompt_tokens,
              completion_tokens: response.usage.completion_tokens,
              total_tokens: response.usage.total_tokens,
            },
          };
        } catch (error) {
          return {
            error: true,
            message:
              error instanceof Error ? error.message : "Unknown error occurred",
          };
        }
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
        const {
          messages,
          model = "sonar",
          max_tokens,
          temperature = 0.2,
          top_p = 0.9,
          search_domain_filter,
          return_images = false,
          return_related_questions = false,
          search_recency_filter,
          search_context_size = "high",
        } = input;

        try {
          const response = await client.chatCompletion({
            model,
            messages: messages as Message[],
            max_tokens,
            temperature,
            top_p,
            search_domain_filter,
            return_images,
            return_related_questions,
            search_recency_filter,
            web_search_options: {
              search_context_size,
            },
          });

          const answer =
            response.choices[0]?.message?.content || "No response generated";

          return {
            answer,
            model: response.model,
            finish_reason: response.choices[0]?.finish_reason,
            usage: {
              prompt_tokens: response.usage.prompt_tokens,
              completion_tokens: response.usage.completion_tokens,
              total_tokens: response.usage.total_tokens,
            },
          };
        } catch (error) {
          return {
            error: true,
            message:
              error instanceof Error ? error.message : "Unknown error occurred",
          };
        }
      },
    },
  },
);

export const perplexityTools = createPerplexityTools;
