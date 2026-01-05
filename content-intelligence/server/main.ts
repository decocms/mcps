/**
 * Content Intelligence MCP Server
 *
 * A domain service for aggregating, normalizing, and enriching content
 * from multiple external sources (RSS, Reddit, web scraping).
 *
 * Configuration Pattern:
 * - Uses StateSchema for user-provided configuration (like readonly-sql)
 * - NOT using Deco bindings since we connect to external APIs
 * - Sources are configured at installation time via state
 *
 * @module main
 * @version 1.0.0
 */

import { DefaultEnv, withRuntime } from "@decocms/runtime";
import {
  type Env as DecoEnv,
  StateSchema as BaseStateSchema,
} from "../shared/deco.gen.ts";
import { z } from "zod";

import { tools } from "./tools/index.ts";

/**
 * Source configuration schemas for StateSchema
 */
const RssSourceSchema = z.object({
  type: z.literal("rss"),
  name: z.string().describe("Source name (e.g., TechCrunch)"),
  feedUrl: z.string().url().describe("RSS/Atom feed URL"),
  enabled: z.boolean().default(true),
});

const RedditSourceSchema = z.object({
  type: z.literal("reddit"),
  name: z.string().describe("Source name (e.g., r/MachineLearning)"),
  subreddit: z.string().describe("Subreddit name (without r/)"),
  sortBy: z.enum(["hot", "new", "top", "rising"]).default("hot"),
  minUpvotes: z.number().int().nonnegative().default(0),
  enabled: z.boolean().default(true),
});

const WebScraperSourceSchema = z.object({
  type: z.literal("web_scraper"),
  name: z.string().describe("Source name"),
  baseUrl: z.string().url().describe("Website base URL"),
  selectors: z.object({
    title: z.string().describe("CSS selector for title"),
    content: z.string().describe("CSS selector for content"),
    link: z.string().optional().describe("CSS selector for link"),
  }),
  enabled: z.boolean().default(true),
});

const SourceSchema = z.discriminatedUnion("type", [
  RssSourceSchema,
  RedditSourceSchema,
  WebScraperSourceSchema,
]);

/**
 * State Schema for Content Intelligence MCP
 *
 * Similar to readonly-sql pattern: configuration provided by user at install time.
 * NOT using Deco bindings because we connect to external APIs.
 */
export const StateSchema = BaseStateSchema.extend({
  /**
   * Content sources to aggregate.
   * Each source is configured with its specific parameters.
   */
  sources: z
    .array(SourceSchema)
    .default([])
    .describe("List of content sources to aggregate"),

  /**
   * OpenAI API key for LLM-based enrichment.
   * Optional - enrichment disabled if not provided.
   */
  openaiApiKey: z
    .string()
    .optional()
    .describe("OpenAI API key for content enrichment (optional)"),

  /**
   * Reddit API credentials for higher rate limits.
   * Optional - uses public API if not provided.
   */
  redditClientId: z
    .string()
    .optional()
    .describe("Reddit OAuth client ID (optional, for higher rate limits)"),
  redditClientSecret: z
    .string()
    .optional()
    .describe("Reddit OAuth client secret (optional)"),

  /**
   * Default relevance threshold for content filtering.
   */
  defaultRelevanceThreshold: z
    .number()
    .min(0)
    .max(1)
    .default(0.5)
    .describe("Default minimum relevance score (0-1)"),

  /**
   * Categories of interest for relevance scoring.
   */
  categoriesOfInterest: z
    .array(
      z.enum([
        "technology",
        "business",
        "science",
        "design",
        "ai_ml",
        "engineering",
        "product",
        "other",
      ]),
    )
    .default(["technology", "ai_ml"])
    .describe("Categories of interest for relevance scoring"),
});

/**
 * Environment type for Content Intelligence MCP
 */
export type Env = DefaultEnv &
  DecoEnv & {
    ASSETS: {
      fetch: (request: Request, init?: RequestInit) => Promise<Response>;
    };
    state: z.infer<typeof StateSchema>;
  };

/**
 * Runtime configuration
 */
const runtime = withRuntime<Env, typeof StateSchema>({
  oauth: {
    /**
     * No Deco bindings needed - we connect to external APIs directly.
     * Configuration comes from StateSchema (like readonly-sql pattern).
     */
    scopes: [],
    state: StateSchema,
  },
  tools,
  fetch: async (req: Request, env: Env) => {
    const url = new URL(req.url);

    // Health check
    if (url.pathname === "/health") {
      return new Response(
        JSON.stringify({
          status: "ok",
          service: "content-intelligence",
          version: "1.0.0",
        }),
        { headers: { "Content-Type": "application/json" } },
      );
    }

    // API routes placeholder
    if (url.pathname.startsWith("/api/")) {
      return new Response(JSON.stringify({ error: "Not implemented" }), {
        status: 501,
        headers: { "Content-Type": "application/json" },
      });
    }

    return env.ASSETS.fetch(req);
  },
});

export default runtime;
