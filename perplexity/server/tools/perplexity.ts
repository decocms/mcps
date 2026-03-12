/**
 * Perplexity AI Tools
 *
 * 4 tools matching the original @perplexity-ai/mcp-server package:
 * - perplexity_ask       → sonar-pro (quick Q&A with citations)
 * - perplexity_research  → sonar-deep-research (deep multi-source, SSE streaming)
 * - perplexity_reason    → sonar-reasoning-pro (step-by-step reasoning)
 * - perplexity_search    → /search endpoint (raw web results)
 */

import { createPrivateTool } from "@decocms/runtime/tools";
import { z } from "zod";
import type { Env } from "../main.ts";
import { getPerplexityApiKey } from "../lib/env.ts";
import {
  performChatCompletion,
  performSearch,
  type Message,
  type ChatOptions,
} from "../lib/perplexity-client.ts";

// ============================================================================
// Shared field definitions (identical to original package)
// ============================================================================

const MessageSchema = z.object({
  role: z
    .enum(["system", "user", "assistant"])
    .describe("Role of the message sender"),
  content: z.string().describe("The content of the message"),
});

const messagesField = z
  .array(MessageSchema)
  .describe("Array of conversation messages");

const stripThinkingField = z
  .boolean()
  .optional()
  .describe(
    "If true, removes <think>...</think> tags and their content from the response to save context tokens. Default is false.",
  );

const searchRecencyFilterField = z
  .enum(["hour", "day", "week", "month", "year"])
  .optional()
  .describe(
    "Filter search results by recency. Use 'hour' for very recent news, 'day' for today's updates, 'week' for this week, etc.",
  );

const searchDomainFilterField = z
  .array(z.string())
  .optional()
  .describe(
    "Restrict search results to specific domains (e.g., ['wikipedia.org', 'arxiv.org']). Use '-' prefix for exclusion (e.g., ['-reddit.com']).",
  );

const searchContextSizeField = z
  .enum(["low", "medium", "high"])
  .optional()
  .describe(
    "Controls how much web context is retrieved. 'low' (default) is fastest, 'high' provides more comprehensive results.",
  );

const reasoningEffortField = z
  .enum(["minimal", "low", "medium", "high"])
  .optional()
  .describe(
    "Controls depth of deep research reasoning. Higher values produce more thorough analysis.",
  );

// ============================================================================
// perplexity_ask
// ============================================================================

export const createAskTool = (env: Env) =>
  createPrivateTool({
    id: "perplexity_ask",
    description:
      "Answer a question using web-grounded AI (Sonar Pro model). " +
      "Best for: quick factual questions, summaries, explanations, and general Q&A. " +
      "Returns a text response with numbered citations. Fastest and cheapest option. " +
      "Supports filtering by recency (hour/day/week/month/year), domain restrictions, and search context size. " +
      "For in-depth multi-source research, use perplexity_research instead. " +
      "For step-by-step reasoning and analysis, use perplexity_reason instead.",
    inputSchema: z.object({
      messages: messagesField,
      search_recency_filter: searchRecencyFilterField,
      search_domain_filter: searchDomainFilterField,
      search_context_size: searchContextSizeField,
    }),
    outputSchema: z.object({
      response: z
        .string()
        .describe(
          "AI-generated text response with numbered citation references",
        ),
    }),
    execute: async ({ context }) => {
      const apiKey = getPerplexityApiKey(env);
      const options: ChatOptions = {
        ...(context.search_recency_filter && {
          search_recency_filter: context.search_recency_filter,
        }),
        ...(context.search_domain_filter && {
          search_domain_filter: context.search_domain_filter,
        }),
        ...(context.search_context_size && {
          search_context_size: context.search_context_size,
        }),
      };
      const response = await performChatCompletion(
        apiKey,
        context.messages as Message[],
        "sonar-pro",
        false,
        Object.keys(options).length > 0 ? options : undefined,
      );
      return { response };
    },
  });

// ============================================================================
// perplexity_research
// ============================================================================

export const createResearchTool = (env: Env) =>
  createPrivateTool({
    id: "perplexity_research",
    description:
      "Conduct deep, multi-source research on a topic (Sonar Deep Research model). " +
      "Best for: literature reviews, comprehensive overviews, investigative queries needing " +
      "many sources. Returns a detailed response with numbered citations. " +
      "Significantly slower than other tools (30+ seconds). " +
      "For quick factual questions, use perplexity_ask instead. " +
      "For logical analysis and reasoning, use perplexity_reason instead.",
    inputSchema: z.object({
      messages: messagesField,
      strip_thinking: stripThinkingField,
      reasoning_effort: reasoningEffortField,
    }),
    outputSchema: z.object({
      response: z
        .string()
        .describe(
          "AI-generated text response with numbered citation references",
        ),
    }),
    execute: async ({ context }) => {
      const apiKey = getPerplexityApiKey(env);
      const stripThinking = context.strip_thinking === true;
      const options: ChatOptions = {
        ...(context.reasoning_effort && {
          reasoning_effort: context.reasoning_effort,
        }),
      };
      const response = await performChatCompletion(
        apiKey,
        context.messages as Message[],
        "sonar-deep-research",
        stripThinking,
        Object.keys(options).length > 0 ? options : undefined,
      );
      return { response };
    },
  });

// ============================================================================
// perplexity_reason
// ============================================================================

export const createReasonTool = (env: Env) =>
  createPrivateTool({
    id: "perplexity_reason",
    description:
      "Analyze a question using step-by-step reasoning with web grounding (Sonar Reasoning Pro model). " +
      "Best for: math, logic, comparisons, complex arguments, and tasks requiring chain-of-thought. " +
      "Returns a reasoned response with numbered citations. " +
      "Supports filtering by recency (hour/day/week/month/year), domain restrictions, and search context size. " +
      "For quick factual questions, use perplexity_ask instead. " +
      "For comprehensive multi-source research, use perplexity_research instead.",
    inputSchema: z.object({
      messages: messagesField,
      strip_thinking: stripThinkingField,
      search_recency_filter: searchRecencyFilterField,
      search_domain_filter: searchDomainFilterField,
      search_context_size: searchContextSizeField,
    }),
    outputSchema: z.object({
      response: z
        .string()
        .describe(
          "AI-generated text response with numbered citation references",
        ),
    }),
    execute: async ({ context }) => {
      const apiKey = getPerplexityApiKey(env);
      const stripThinking = context.strip_thinking === true;
      const options: ChatOptions = {
        ...(context.search_recency_filter && {
          search_recency_filter: context.search_recency_filter,
        }),
        ...(context.search_domain_filter && {
          search_domain_filter: context.search_domain_filter,
        }),
        ...(context.search_context_size && {
          search_context_size: context.search_context_size,
        }),
      };
      const response = await performChatCompletion(
        apiKey,
        context.messages as Message[],
        "sonar-reasoning-pro",
        stripThinking,
        Object.keys(options).length > 0 ? options : undefined,
      );
      return { response };
    },
  });

// ============================================================================
// perplexity_search
// ============================================================================

export const createSearchTool = (env: Env) =>
  createPrivateTool({
    id: "perplexity_search",
    description:
      "Search the web and return a ranked list of results with titles, URLs, snippets, and dates. " +
      "Best for: finding specific URLs, checking recent news, verifying facts, discovering sources. " +
      "Returns formatted results (title, URL, snippet, date) — no AI synthesis. " +
      "For AI-generated answers with citations, use perplexity_ask instead.",
    inputSchema: z.object({
      query: z.string().describe("Search query string"),
      max_results: z
        .number()
        .min(1)
        .max(20)
        .optional()
        .describe("Maximum number of results to return (1-20, default: 10)"),
      max_tokens_per_page: z
        .number()
        .min(256)
        .max(2048)
        .optional()
        .describe("Maximum tokens to extract per webpage (default: 1024)"),
      country: z
        .string()
        .length(2)
        .toUpperCase()
        .optional()
        .describe(
          "ISO 3166-1 alpha-2 country code for regional results (e.g., 'US', 'GB')",
        ),
    }),
    outputSchema: z.object({
      results: z
        .string()
        .describe(
          "Formatted search results, each with title, URL, snippet, and date",
        ),
    }),
    execute: async ({ context }) => {
      const apiKey = getPerplexityApiKey(env);
      const results = await performSearch(
        apiKey,
        context.query,
        context.max_results ?? 10,
        context.max_tokens_per_page ?? 1024,
        context.country,
      );
      return { results };
    },
  });

// ============================================================================
// Export all perplexity tools
// ============================================================================

export const perplexityTools = [
  createAskTool,
  createResearchTool,
  createReasonTool,
  createSearchTool,
];
