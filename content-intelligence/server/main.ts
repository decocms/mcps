/**
 * Content Intelligence MCP Server
 *
 * A domain service for aggregating, normalizing, and enriching content
 * from multiple external sources (RSS, Reddit, web scraping).
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
 * State Schema for Content Intelligence MCP
 *
 * All fields are simple strings/numbers for easy form input.
 */
export const StateSchema = BaseStateSchema.extend({
  /**
   * RSS feed URLs (one per line)
   */
  rssFeeds: z.string().default("").describe("RSS feed URLs, one per line"),

  /**
   * Reddit subreddits to follow (comma-separated)
   */
  subreddits: z
    .string()
    .default("")
    .describe(
      "Subreddits to follow, comma-separated (e.g. MachineLearning, programming)",
    ),

  /**
   * Minimum upvotes for Reddit posts
   */
  redditMinUpvotes: z
    .number()
    .int()
    .min(0)
    .default(50)
    .describe("Minimum upvotes for Reddit posts"),

  /**
   * OpenAI API key for content enrichment (optional)
   */
  openaiApiKey: z
    .string()
    .default("")
    .describe("OpenAI API key for summaries and classification (optional)"),

  /**
   * Topics/categories of interest - free text input
   */
  topicsOfInterest: z
    .string()
    .default("AI, technology, startups")
    .describe(
      "Topics you're interested in, comma-separated (e.g. AI, technology, startups, design)",
    ),

  /**
   * Minimum relevance score (0-100)
   */
  minRelevanceScore: z
    .number()
    .int()
    .min(0)
    .max(100)
    .default(50)
    .describe("Minimum relevance score 0-100"),
});

/**
 * Helper to parse sources from state
 */
export function parseSourcesFromState(state: z.infer<typeof StateSchema>) {
  const sources: Array<{
    type: "rss" | "reddit";
    name: string;
    config: Record<string, unknown>;
  }> = [];

  // Parse RSS feeds
  const rssFeeds = state.rssFeeds
    .split("\n")
    .map((url) => url.trim())
    .filter((url) => url.length > 0 && url.startsWith("http"));

  for (const feedUrl of rssFeeds) {
    try {
      const url = new URL(feedUrl);
      sources.push({
        type: "rss",
        name: url.hostname,
        config: { feedUrl },
      });
    } catch {
      // Invalid URL, skip
    }
  }

  // Parse subreddits
  const subreddits = state.subreddits
    .split(",")
    .map((s) => s.trim())
    .filter((s) => s.length > 0);

  for (const subreddit of subreddits) {
    sources.push({
      type: "reddit",
      name: `r/${subreddit}`,
      config: {
        subreddit,
        sortBy: "hot",
        minUpvotes: state.redditMinUpvotes,
      },
    });
  }

  return sources;
}

/**
 * Helper to parse topics from state
 */
export function parseTopicsFromState(state: z.infer<typeof StateSchema>) {
  return state.topicsOfInterest
    .split(",")
    .map((t) => t.trim())
    .filter((t) => t.length > 0);
}

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
